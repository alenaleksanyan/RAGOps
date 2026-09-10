from __future__ import annotations

from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import TokenTextSplitter


def split_token_window(
    documents: list[LCDocument],
    chunk_size: int = 512,
    chunk_overlap: int = 64,
    encoding_name: str = "cl100k_base",
) -> list[LCDocument]:
    """Splits documents using exact token window bounds via LangChain's TokenTextSplitter."""
    splitter = TokenTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        encoding_name=encoding_name,
    )
    return splitter.split_documents(documents)
