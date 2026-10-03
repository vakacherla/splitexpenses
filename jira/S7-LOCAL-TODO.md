# Jira-lite update for the usage and invite work (run from a local session)

Decision (owner, 3 Oct 2026): put these stories in a **new sprint S7**.

1. Import `jira/SE-jira-delta-usage-invites.csv` (21 new issues: EP-14, REQ-USE-*, REQ-INV-*). Import only creates issues.
2. Create sprint **S7**. Assign the shipped items (REQ-USE-01..09, REQ-USE-25, REQ-INV-01) and close it; unbuilt items stay in backlog.
3. Link every story, including REQ-INV-*, to epic EP-14 (owner decision, 3 Oct 2026).
4. Release labels: REQ-USE-01..09 `rel-2026-10-03-24e35ae`, REQ-USE-25 `rel-2026-10-03-9a14398`, REQ-INV-01 `rel-2026-10-03-e3e3cfd`.
5. Mark REQ-TRIP-12 and REQ-GRO-01 superseded by REQ-INV-01.
6. Read the jira-lite backend routes first (`../Proj Mgmt Tool`, backend on localhost:8000). The owner signs in to Chrome; never enter credentials. Ask before any push to the jira-lite repo.
