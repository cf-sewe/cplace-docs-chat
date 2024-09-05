import os
from operator import itemgetter
from typing import Dict, List, Optional, Sequence

from constants import REPHRASE_TEMPLATE, RESPONSE_TEMPLATE
from elasticsearch import Elasticsearch
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
    return es_store.as_retriever(search_kwargs={"k": 6})


def format_docs(docs: Sequence[lc_docs.Document]) -> str:
    """Format document sequence into doc blocks."""
    return "\n".join(
        f"<doc id='{i}'>{doc.page_content}</doc>" for i, doc in enumerate(docs)
    )


def serialize_history(request) -> List[lc_msgs.BaseMessage]:
    """Convert chat history into a list of message objects, preserving the original order."""
    if isinstance(request, dict):
        # If input is dictionary, convert to ChatRequest object
        request = ChatRequest(**request)
    chat_history = request.chat_history or []
    converted_chat_history = []
    for message in chat_history:
        if message.get("human") is not None:
            converted_chat_history.append(
                lc_msgs.HumanMessage(content=message["human"])
            )
        if message.get("ai") is not None:
            converted_chat_history.append(lc_msgs.AIMessage(content=message["ai"]))
    return converted_chat_history


def create_retriever_chain(
    llm: lc_models.LanguageModelLike, retriever: lc_retrievers.BaseRetriever
) -> lc_runnables.Runnable:
    CONDENSE_QUESTION_PROMPT = lc_prompts.PromptTemplate.from_template(
        REPHRASE_TEMPLATE
    )
    # Note: Always use an efficient language model for the condense question chain
    condense_question_chain = (
        CONDENSE_QUESTION_PROMPT | llm | lc_parsers.StrOutputParser()
    ).with_config(
        run_name="CondenseQuestion",
    )
    conversation_chain = condense_question_chain | retriever
    return lc_runnables.RunnableBranch(
        (
            lc_runnables.RunnableLambda(
                lambda x: bool(x.get("chat_history"))
            ).with_config(run_name="HasChatHistoryCheck"),
            conversation_chain.with_config(run_name="RetrievalChainWithHistory"),
        ),
        (
            lc_runnables.RunnableLambda(itemgetter("question")).with_config(
                run_name="Itemgetter:question"
            )
            | retriever
        ).with_config(run_name="RetrievalChainWithNoHistory"),
    ).with_config(run_name="RouteDependingOnChatHistory")


def create_chain(
    llm: lc_models.LanguageModelLike, retriever: lc_retrievers.BaseRetriever
) -> lc_runnables.Runnable:
    retriever_chain = create_retriever_chain(
        llm,
        retriever,
    ).with_config(run_name="FindDocs")
    context = (
        lc_runnables.RunnablePassthrough.assign(docs=retriever_chain)
        .assign(context=lambda x: format_docs(x["docs"]))
        .with_config(run_name="RetrieveDocs")
    )
    prompt = lc_prompts.ChatPromptTemplate.from_messages(
        [
            ("system", RESPONSE_TEMPLATE),
            lc_prompts.MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{question}"),
        ]
    )
    response_synthesizer = (prompt | llm | lc_parsers.StrOutputParser()).with_config(
        run_name="GenerateResponse"
    )
    return (
        lc_runnables.RunnablePassthrough.assign(chat_history=serialize_history)
        | context
        | response_synthesizer
    )


# Model initialization for AzureChatOpenAI
llm = AzureChatOpenAI(
    azure_deployment="gpt-4o-mini",
    model_name="gpt-4o-mini",
    model_version="2024-07-18",
    temperature=0.01,
    streaming=True,
    timeout=120,
)

answer_chain = create_chain(llm, get_retriever())
