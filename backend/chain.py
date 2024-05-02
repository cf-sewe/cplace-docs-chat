import os
from operator import itemgetter
from typing import Dict, List, Optional, Sequence

from constants import REPHRASE_TEMPLATE, RESPONSE_TEMPLATE
from elasticsearch import Elasticsearch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core import documents as lc_docs
from langchain_core import language_models as lc_models
from langchain_core import messages as lc_msgs
from langchain_core import output_parsers as lc_parsers
from langchain_core import prompts as lc_prompts
from langchain_core import pydantic_v1 as lc_pydantic
from langchain_core import retrievers as lc_retrievers
from langchain_core import runnables as lc_runnables
from langchain_elasticsearch import ElasticsearchStore
from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings
from langsmith import Client

# Initialize Langsmith client
client = Client()

# Initialize FastAPI with CORS
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("EXTERNAL_URL", "http://localhost:8080")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type"],
    expose_headers=["Content-Type"],
)

class ChatRequest(lc_pydantic.BaseModel):
    question: str
    chat_history: Optional[List[Dict[str, str]]]

def get_retriever() -> lc_retrievers.BaseRetriever:
    """Set up and return an Elasticsearch-based document retriever."""
    es_client = Elasticsearch(
        hosts=os.getenv("ELASTICSEARCH_URL"),
        api_key=os.getenv("ELASTICSEARCH_API_KEY"),
        request_timeout=60,
        max_retries=2,
    )
    es_store = ElasticsearchStore(
        es_connection=es_client,
        embedding=AzureOpenAIEmbeddings(azure_deployment="embedding", timeout=60.0),
        index_name=os.getenv("ELASTICSEARCH_INDEX_NAME"),
    )
    return es_store.as_retriever(search_kwargs={'k': 6})

def format_docs(docs: Sequence[lc_docs.Document]) -> str:
    """Format document sequence into doc blocks."""
    return "\n".join(f"<doc id='{i}'>{doc.page_content}</doc>" for i, doc in enumerate(docs))

def serialize_history(request: ChatRequest) -> List[lc_msgs.Message]:
    """Convert chat history into a list of message objects, preserving the original order."""
    chat_history = request.chat_history or []
    converted_chat_history = []
    for message in chat_history:
        if message.get("human") is not None:
            converted_chat_history.append(lc_msgs.HumanMessage(content=message["human"]))
        if message.get("ai") is not None:
            converted_chat_history.append(lc_msgs.AIMessage(content=message["ai"]))
    return converted_chat_history


def create_chain(llm: lc_models.LanguageModelLike, retriever: lc_retrievers.BaseRetriever) -> lc_runnables.Runnable:
    """
    Creates a processing chain that integrates a language model and a document retriever to handle and respond to chat requests.
    This chain manages retrieval of documents, formatting these documents, and generating a response based on a given template.

    Args:
        llm (lc_models.LanguageModelLike): The language model to be used for generating responses.
        retriever (lc_retrievers.BaseRetriever): The document retriever for fetching relevant documents based on the query.

    Returns:
        lc_runnables.Runnable: A configured chain of operations to handle a chat request.
    """

    # Define a prompt template for rephrasing questions based on existing chat history
    condense_question_prompt = lc_prompts.PromptTemplate.from_template(REPHRASE_TEMPLATE)

    # Create a runnable sequence for handling queries with existing chat history
    retrieval_chain_with_history = lc_runnables.RunnableSequence([
        lc_runnables.RunnableLambda(lambda x: bool(x.get("chat_history"))),
        lc_runnables.RunnablePassthrough(assign=lambda x: {
            'chat_history': x['chat_history'],
            'question': x['question']
        }),
        condense_question_prompt | gpt_3_5 | lc_parsers.StrOutputParser(),
        retriever,
        lc_runnables.RunnableLambda(lambda docs: format_docs(docs["docs"]))
    ]).with_config(run_name="RetrievalChainWithHistory")

    # Create a runnable sequence for handling queries without existing chat history
    retrieval_chain_no_history = lc_runnables.RunnableSequence([
        lc_runnables.RunnableLambda(itemgetter("question")),
        retriever,
        lc_runnables.RunnableLambda(lambda docs: format_docs(docs["docs"]))
    ]).with_config(run_name="RetrievalChainNoHistory")

    # Configure response synthesizer
    response_synthesizer = lc_runnables.RunnablePassthrough(assign=lambda context: {
        "chat_history": serialize_history(context['request']),
        "formatted_docs": context['formatted_docs']
    }) | lc_runnables.RunnableBranch(
        lc_runnables.RunnableLambda(lambda x: x),
        lc_runnables.RunnableSequence([
            lc_prompts.ChatPromptTemplate.from_messages([
                ("system", RESPONSE_TEMPLATE),
                lc_prompts.MessagesPlaceholder(variable_name="chat_history"),
                ("human", "{question}"),
            ]),
            llm,
            lc_parsers.StrOutputParser()
        ])
    ).with_config(run_name="GenerateResponse")

    # Combine all elements into a single processing chain
    return lc_runnables.RunnableBranch(
        (retrieval_chain_with_history, response_synthesizer),
        (retrieval_chain_no_history, response_synthesizer)
    ).with_config(run_name="CompleteChatHandlingChain")

# Model initialization for AzureChatOpenAI
gpt_3_5 = AzureChatOpenAI(
    azure_deployment="gpt-35-turbo", model_name="gpt-3-5-turbo", model_version="1106", temperature=0, streaming=True
)
gpt_4 = AzureChatOpenAI(
    azure_deployment="gpt-4", model_name="gpt-4-turbo", model_version="1106-Preview", temperature=0, streaming=True
)

# Configurable language model alternative setup
llm = gpt_3_5.configurable_alternatives(
    lc_runnables.ConfigurableField(id="llm"),
    default_key="openai_gpt_3_5_turbo",
    openai_gpt_4_turbo=gpt_4,
).with_fallbacks([gpt_3_5, gpt_4])

retriever = get_retriever()
answer_chain = create_chain(llm, retriever)
