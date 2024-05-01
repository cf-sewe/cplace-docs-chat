import os
from operator import itemgetter
from typing import Dict, List, Optional, Sequence

from elasticsearch import Elasticsearch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from ingest import get_embeddings_model
from langchain_core.documents import Document
from langchain_core.language_models import LanguageModelLike
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import (ChatPromptTemplate, MessagesPlaceholder,
                                    PromptTemplate)
from langchain_core.pydantic_v1 import BaseModel
from langchain_core.retrievers import BaseRetriever
from langchain_core.runnables import (ConfigurableField, Runnable,
                                      RunnableBranch, RunnableLambda,
                                      RunnablePassthrough, RunnableSequence)
from langchain_elasticsearch import ElasticsearchStore
from langchain_openai import AzureChatOpenAI
from langsmith import Client

RESPONSE_TEMPLATE = """
You are interfacing with the cplace knowledge base. Your task is to answer questions specifically about cplace using the information provided below.
Follow these guidelines for your response:
- **Answer Length**: Keep your answer concise and to the point. The answer should be between 50 and 200 words.
- **Source Use**: Use only the information from the provided search results, which include URLs and content. Do not introduce external data.
- **Tone and Style**: Maintain an unbiased, journalistic tone. Your answer should merge information from different sources coherently.
- **Citation**: Use the [${{number}}] notation for citations. Place these citations at the end of the sentence or the relevant paragraph. Write separate answers for queries that involve different entities with the same name.
- **Formatting**: Use bullet points to structure your answer, which aids in readability.
- **Handling Uncertainty**: If the information at hand does not fully answer the question, state clearly why a complete answer cannot be provided instead of making assumptions or fabricating responses.

### Context for the Query:
<context>
{context}
<context/>

Note: All information between the 'context' HTML tags comes from the knowledge base and is not part of this conversation.
"""

REPHRASE_TEMPLATE = """\
Given the following conversation and a follow up question, rephrase the follow up \
question to be a standalone question, preserving the original language.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone Question:"""


client = Client()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("EXTERNAL_URL", "http://localhost:8080")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    question: str
    chat_history: Optional[List[Dict[str, str]]]

def get_retriever() -> BaseRetriever:
    """
    Initializes and returns a retriever based on Elasticsearch for querying documents.

    This function configures an Elasticsearch client connected to a specified index.
    The retriever uses this setup to query documents based on text queries,
    specifically retrieving document attributes like source and title for each search result.

    Returns:
        An instance of BaseRetriever configured to use Elasticsearch.
    """

    # Initialize Elasticsearch client
    es_client = Elasticsearch(
        hosts=os.getenv("ELASTICSEARCH_URL"),
        api_key=os.getenv("ELASTICSEARCH_API_KEY"),
        request_timeout=60,
        max_retries=2,
    )

    # Create an ElasticsearchStore with the specified index and query attributes
    es_store = ElasticsearchStore(
        es_connection=es_client,
        embedding=get_embeddings_model(),
        index_name=os.getenv("ELASTICSEARCH_INDEX_NAME"),
    )

    return es_store.as_retriever(search_kwargs=dict(k=6))

def create_retriever_chain(
    llm: LanguageModelLike, retriever: BaseRetriever
) -> Runnable:
    CONDENSE_QUESTION_PROMPT = PromptTemplate.from_template(REPHRASE_TEMPLATE)
    condense_question_chain = (
        CONDENSE_QUESTION_PROMPT | llm | StrOutputParser()
    ).with_config(
        run_name="CondenseQuestion",
    )
    conversation_chain = condense_question_chain | retriever
    return RunnableBranch(
        (
            RunnableLambda(lambda x: bool(x.get("chat_history"))).with_config(
                run_name="HasChatHistoryCheck"
            ),
            conversation_chain.with_config(run_name="RetrievalChainWithHistory"),
        ),
        (
            RunnableLambda(itemgetter("question")).with_config(
                run_name="Itemgetter:question"
            )
            | retriever
        ).with_config(run_name="RetrievalChainWithNoHistory"),
    ).with_config(run_name="RouteDependingOnChatHistory")


def format_docs(docs: Sequence[Document]) -> str:
    formatted_docs = []
    for i, doc in enumerate(docs):
        doc_string = f"<doc id='{i}'>{doc.page_content}</doc>"
        formatted_docs.append(doc_string)
    return "\n".join(formatted_docs)


def serialize_history(request: ChatRequest):
    chat_history = request["chat_history"] or []
    converted_chat_history = []
    for message in chat_history:
        if message.get("human") is not None:
            converted_chat_history.append(HumanMessage(content=message["human"]))
        if message.get("ai") is not None:
            converted_chat_history.append(AIMessage(content=message["ai"]))
    return converted_chat_history


def create_chain(llm: LanguageModelLike, retriever: BaseRetriever) -> Runnable:
    retriever_chain = create_retriever_chain(
        llm,
        retriever,
    ).with_config(run_name="FindDocs")
    context = (
        RunnablePassthrough.assign(docs=retriever_chain)
        .assign(context=lambda x: format_docs(x["docs"]))
        .with_config(run_name="RetrieveDocs")
    )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", RESPONSE_TEMPLATE),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{question}"),
        ]
    )
    default_response_synthesizer = prompt | llm

    response_synthesizer = (
        default_response_synthesizer.configurable_alternatives(
            ConfigurableField("llm"),
            default_key="openai_gpt_3_5_turbo",
            openai_gpt_4_turbo=default_response_synthesizer,
        )
        | StrOutputParser()
    ).with_config(run_name="GenerateResponse")
    return (
        RunnablePassthrough.assign(chat_history=serialize_history)
        | context
        | response_synthesizer
    )

# Initialize AzureChatOpenAI models for different versions
gpt_3_5 = AzureChatOpenAI(
    azure_deployment="gpt-35-turbo",
    model_name="gpt-3-5-turbo",
    model_version="1106",
    temperature=0,
    streaming=True,
)
gpt_4 = AzureChatOpenAI(
    azure_deployment="gpt-4",
    model_name="gpt-4-turbo",
    model_version="1106-Preview",
    temperature=0,
    streaming=True,
)

llm = gpt_3_5.configurable_alternatives(
    # This gives this field an id
    # When configuring the end runnable, we can then use this id to configure this field
    ConfigurableField(id="llm"),
    default_key="openai_gpt_3_5_turbo",
    openai_gpt_4_turbo=gpt_4,
).with_fallbacks([gpt_3_5, gpt_4])

retriever = get_retriever()
answer_chain = create_chain(llm, retriever)
