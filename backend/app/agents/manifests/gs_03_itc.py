from app.agents.runtime import AgentManifest, FORBIDDEN_TOOLS

GS03_Manifest = AgentManifest(
    agent_id="GS-3",
    agent_name="Input Credit Matcher",
    family="GST",
    version="1.0.0",
    description="Matches books ITC vs GSTR-2B",
    allowed_tools=['fetch_2b_data', 'match_books_vs_2b', 'check_blocked_credit_17_5', 'compute_rule37_aging', 'generate_mismatch_report'],
    forbidden_tools=FORBIDDEN_TOOLS,
    input_schema={},
    output_schema={},
    confidence_threshold=0.95,
    gates=['G4']
)
