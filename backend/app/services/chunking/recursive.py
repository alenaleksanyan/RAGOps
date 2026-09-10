from __future__ import annotations

from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter


def split_recursive(
    documents: list[LCDocument],
    chunk_size: int = 500,
    chunk_overlap: int = 50,
    separators: list[str] | None = None,
) -> list[LCDocument]:
    """Splits documents using LangChain's RecursiveCharacterTextSplitter."""
    seps = separators or ["\n\n", "\n", " ", ""]
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=seps,
        length_function=len,
        is_separator_regex=False,
    )
    return splitter.split_documents(documents)
