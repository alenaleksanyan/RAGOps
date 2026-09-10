from __future__ import annotations

import uuid
from dataclasses import dataclass

from langchain_core.documents import Document as LCDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter


@dataclass
class HierarchicalChunk:
    parent_doc: LCDocument
    parent_id: str
    child_docs: list[LCDocument]


def split_parent_document(
    documents: list[LCDocument],
    parent_chunk_size: int = 1500,
    parent_chunk_overlap: int = 150,
    child_chunk_size: int = 300,
    child_chunk_overlap: int = 30,
) -> tuple[list[LCDocument], list[LCDocument]]:
    """Splits documents into a hierarchy of large Parent chunks and smaller Child chunks.

    Returns: (parent_documents, child_documents_with_parent_id)
    """
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=parent_chunk_size,
        chunk_overlap=parent_chunk_overlap,
    )
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=child_chunk_size,
        chunk_overlap=child_chunk_overlap,
    )

    all_parents: list[LCDocument] = []
    all_children: list[LCDocument] = []

    for doc in documents:
        parents = parent_splitter.split_documents([doc])
        for p_idx, parent in enumerate(parents):
            parent_id = str(uuid.uuid4())
            parent.metadata["parent_id"] = parent_id
            parent.metadata["is_parent"] = True
            parent.metadata["parent_index"] = p_idx
            all_parents.append(parent)

            # Split parent into children
            children = child_splitter.split_documents([parent])
            for c_idx, child in enumerate(children):
                child.metadata["parent_id"] = parent_id
                child.metadata["is_child"] = True
                child.metadata["child_index"] = c_idx
                all_children.append(child)

    return all_parents, all_children
