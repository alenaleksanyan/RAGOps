from __future__ import annotations

import os
import hashlib
import logging
import tempfile
from typing import Any
from pathlib import Path
from dataclasses import dataclass

# pyrefly: ignore [missing-import]
from langchain_core.documents import Document as LCDocument

logger = logging.getLogger(__name__)


@dataclass
class ParsedDocumentResult:
    content: str
    documents: list[LCDocument]
    page_count: int
    content_hash: str
    doc_metadata: dict[str, Any]


class DocumentParserEngine:
    """Multi-format async document ingestion engine using LangChain loaders with fallback support

    for PDF, Markdown, DOCX, Plain Text, and HTML.
    """

    @classmethod
    def compute_sha256(cls, file_bytes: bytes) -> str:
        return hashlib.sha256(file_bytes).hexdigest()

    @classmethod
    async def parse_bytes(
        cls,
        file_bytes: bytes,
        filename: str,
        mime_type: str = "text/plain",
    ) -> ParsedDocumentResult:
        """Parse raw file bytes asynchronously using the appropriate LangChain loader."""
        content_hash = cls.compute_sha256(file_bytes)
        ext = Path(filename).suffix.lower()

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            lc_docs: list[LCDocument] = []
            page_count = 1

            if ext == ".pdf" or "pdf" in mime_type:
                try:
                    # pyrefly: ignore [missing-import]
                    from langchain_community.document_loaders import PyPDFLoader
                    loader = PyPDFLoader(tmp_path)
                    lc_docs = loader.load()
                    page_count = len(lc_docs)
                except Exception as e:
                    logger.warning(f"PyPDFLoader failed, attempting fallback: {e}")
                    # pyrefly: ignore [missing-import]
                    from langchain_community.document_loaders import UnstructuredFileLoader
                    loader = UnstructuredFileLoader(tmp_path)
                    lc_docs = loader.load()

            elif ext in (".docx", ".doc") or "word" in mime_type:
                try:
                    # pyrefly: ignore [missing-import]
                    from langchain_community.document_loaders import Docx2txtLoader
                    loader = Docx2txtLoader(tmp_path)
                    lc_docs = loader.load()
                except Exception:
                    # pyrefly: ignore [missing-import]
                    from langchain_community.document_loaders import UnstructuredFileLoader
                    loader = UnstructuredFileLoader(tmp_path)
                    lc_docs = loader.load()

            elif ext in (".md", ".markdown"):
                # pyrefly: ignore [missing-import]
                # pyrefly: ignore [missing-import]
                from langchain_community.document_loaders import UnstructuredMarkdownLoader
                try:
                    loader = UnstructuredMarkdownLoader(tmp_path)
                    lc_docs = loader.load()
                except Exception:
                    # pyrefly: ignore [missing-import]
                    from langchain_community.document_loaders import TextLoader
                    loader = TextLoader(tmp_path, encoding="utf-8")
                    lc_docs = loader.load()

            else:
                # Default plain text
                # pyrefly: ignore [missing-import]
                from langchain_community.document_loaders import TextLoader
                try:
                    loader = TextLoader(tmp_path, encoding="utf-8")
                    lc_docs = loader.load()
                except UnicodeDecodeError:
                    loader = TextLoader(tmp_path, encoding="latin-1")
                    lc_docs = loader.load()

            # Merge all page texts for full content
            full_text = "\n\n".join(doc.page_content for doc in lc_docs)

            metadata: dict[str, Any] = {
                "filename": filename,
                "mime_type": mime_type,
                "file_size": len(file_bytes),
                "num_pages": page_count,
                "extracted_sections": len(lc_docs),
            }

            return ParsedDocumentResult(
                content=full_text,
                documents=lc_docs,
                page_count=page_count,
                content_hash=content_hash,
                doc_metadata=metadata,
            )

        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
