from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

GS02_Manifest = AgentManifest(
    agent_id="GS-2",
    agent_name="IMS Invoice Triage Agent",
    family="GST",
    version="1.0.0",
    description="Triages IMS invoices",
    allowed_tools=['fetch_ims_invoices', 'compute_vendor_risk_score', 'match_purchase_order', 'propose_ims_action', 'flag_suspicious_vendor'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=['G3']
)
