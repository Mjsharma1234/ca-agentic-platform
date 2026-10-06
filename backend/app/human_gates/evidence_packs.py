from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass
class EvidenceItem:
    item_type: str  # IMAGE, TABLE, DIFF, MEMO, METRIC
    title: str
    data: Any
    highlight_areas: Optional[List[Dict[str, Any]]] = None

@dataclass
class EvidencePack:
    gate_id: str
    gate_name: str
    gate_description: str
    tier: str  # L2 or L3
    entity_summary: str
    visual_evidence: List[EvidenceItem]
    numerical_evidence: List[EvidenceItem]
    risk_indicators: List[str]
    action_required: str
    cannot_be_automated_reason: str

def generate_evidence_pack(gate_id: str, entity_type: str, entity_id: str, context: dict) -> EvidencePack:
    if gate_id == "G2":
        return EvidencePack(
            gate_id="G2",
            gate_name="OCR Review",
            gate_description="Review extracted data from invoice",
            tier="L2",
            entity_summary=f"Invoice OCR results for {entity_id}",
            visual_evidence=[EvidenceItem("IMAGE", "Original Invoice", context.get("image_url", ""))],
            numerical_evidence=[EvidenceItem("TABLE", "Extracted Fields", context.get("extracted_data", {}))],
            risk_indicators=["Low confidence extraction on Invoice Number"],
            action_required="Approve or correct extracted data",
            cannot_be_automated_reason="Confidence score below 0.95 requires human verification"
        )
    elif gate_id == "G6":
        return EvidencePack(
            gate_id="G6",
            gate_name="Four-Eyes Review",
            gate_description="Review completed return before signing",
            tier="L3",
            entity_summary=f"GST Return for {entity_id}",
            visual_evidence=[],
            numerical_evidence=[
                EvidenceItem("TABLE", "Return Summary", context.get("return_summary", {})),
                EvidenceItem("MEMO", "Variance vs Prev Month", context.get("variance_memo", ""))
            ],
            risk_indicators=context.get("rule_check_warnings", []),
            action_required="Approve return for partner signing",
            cannot_be_automated_reason="Maker-checker principle mandates human review by non-preparer"
        )
    
    return EvidencePack(
        gate_id=gate_id,
        gate_name="Generic Gate",
        gate_description="Review required",
        tier="L2",
        entity_summary=f"Entity {entity_id}",
        visual_evidence=[],
        numerical_evidence=[],
        risk_indicators=[],
        action_required="Review and approve",
        cannot_be_automated_reason="Human decision required"
    )
