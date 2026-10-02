import subprocess, re, json, csv
sh = lambda *a: subprocess.run(a, capture_output=True, text=True, check=True).stdout
# releases = recorded pushes (reflog) plus three Sep 6 tips that arrived by fetch/pull from another machine
rl = sh('git','reflog','show','origin/main','--date=format:%Y-%m-%d %H:%M','--format=%h|%gd|%gs').splitlines()
rel = []
for l in rl:
    h, gd, gs = l.split('|', 2)
    d = re.search(r'\{(.+)\}', gd).group(1)
    if gs == 'update by push' or h in ('68ac180', '9d59193', 'c338036'):
        rel.append((d, h))
rel.sort()
tips = [(d, h) for d, h in rel]
full = {h: sh('git','rev-parse',h).strip() for _, h in tips}
order = sh('git','rev-list','--reverse','HEAD').split()
def release_of(commit):
    c = sh('git','rev-parse', commit).strip()
    for d, h in tips:
        if subprocess.run(['git','merge-base','--is-ancestor', c, full[h]]).returncode == 0:
            return d, h
    return None
label = lambda d, h: f"rel-{d[:10]}-{h[:7]}"
M = {  # issue id -> commit that first shipped it
'REQ-AUTH-01':'55d2564','REQ-AUTH-02':'55d2564','REQ-AUTH-03':'55d2564','REQ-AUTH-04':'838745b','REQ-AUTH-05':'55d2564','REQ-AUTH-06':'9d59193','REQ-AUTH-07':'2a12bad','REQ-AUTH-08':'a6f9bf3','REQ-AUTH-09':'2966a01','REQ-AUTH-10':'2966a01',
'REQ-TRIP-01':'55d2564','REQ-TRIP-02':'55d2564','REQ-TRIP-03':'55d2564','REQ-TRIP-04':'55d2564','REQ-TRIP-05':'a62156c','REQ-TRIP-06':'25411e2','REQ-TRIP-07':'cc7159a','REQ-TRIP-08':'d6c4b53','REQ-TRIP-09':'55d2564','REQ-TRIP-10':'3eb1e0b','REQ-TRIP-11':'9d59193',
'REQ-CIRC-01':'b03ba75','REQ-CIRC-02':'b03ba75','REQ-CIRC-03':'094f3d0','REQ-CIRC-04':'b03ba75','REQ-CIRC-05':'b03ba75','REQ-CIRC-06':'094f3d0','REQ-CIRC-07':'36e70ce','REQ-CIRC-08':'b03ba75',
'REQ-EXP-01':'55d2564','REQ-EXP-02':'55d2564','REQ-EXP-03':'55d2564','REQ-EXP-04':'a823ab2','REQ-EXP-05':'55d2564','REQ-EXP-06':'55d2564','REQ-EXP-07':'55d2564','REQ-EXP-08':'a62156c','REQ-EXP-09':'2498e2f','REQ-EXP-10':'0f9859f','REQ-EXP-11':'55d2564','REQ-EXP-12':'a823ab2',
'REQ-BAL-01':'55d2564','REQ-BAL-02':'55d2564','REQ-BAL-03':'55d2564','REQ-BAL-04':'55d2564','REQ-BAL-05':'55d2564','REQ-BAL-06':'a62156c','REQ-BAL-07':'a5b64e1',
'REQ-REP-01':'55d2564','REQ-REP-02':'55d2564','REQ-REP-03':'51fcefb','REQ-REP-04':'81cae01',
'REQ-ACT-01':'277bc74','REQ-ACT-02':'cc7159a','REQ-ACT-03':'277bc74','REQ-ACT-04':'277bc74','REQ-ACT-05':'277bc74',
'REQ-OFF-01':'a62156c','REQ-OFF-02':'a62156c','REQ-OFF-03':'a62156c','REQ-OFF-04':'3ece6b0','REQ-OFF-05':'c3f5946',
'REQ-ONB-01':'0af6aae','REQ-ONB-02':'4d23709','REQ-ONB-03':'4d23709','REQ-ONB-04':'9c3de3f',
'DEF-001':'0869eff','DEF-002':'29e95f2','DEF-003':'0869eff','DEF-004':'29e95f2','DEF-005':'0869eff','DEF-005b':'0869eff','DEF-006':'0869eff','DEF-007':'0869eff','DEF-008':'cd00527','DEF-009':'7f3f941','DEF-010':'0869eff','DEF-011':'0869eff','DEF-012':'0869eff','DEF-013':'084a213','DEF-013b':'0869eff','DEF-014':'66669c8','DEF-015':'81cae01','DEF-016':'a823ab2','DEF-017':'d6c4b53','DEF-018':'2cf0fa8','DEF-019':'a5b64e1','DEF-020':'4f5e184','DEF-020b':'a62156c','DEF-021b':'a62156c','DEF-022':'cc7159a','DEF-023':'f8cdde5','DEF-024':'2a12bad','DEF-027':'88c45ec','DEF-029':'1059afb','DEF-032':'19f5b4a','DEF-033':'3eb1e0b','DEF-034':'8ae8e13','DEF-037':'a62156c'}
for i in range(1, 4): pass
for a in ['ADM-01','ADM-02','ADM-03']: M['REQ-'+a]='55d2564'
for a in ['ADM-04','ADM-05','ADM-06','ADM-07','ADM-08','ADM-09']: M['REQ-'+a]='a62156c'
for a in ['SEC-01','SEC-02','SEC-03','SEC-04','SEC-05','SEC-06']: M['REQ-'+a]='55d2564'
out = {}; releases = {}
for k, c in M.items():
    r = release_of(c)
    if not r: print('no release for', k, c); continue
    lb = label(*r); out[k] = lb; releases.setdefault(lb, dict(date=r[0], tip=r[1], issues=[]))['issues'].append(k)
json.dump(out, open('jira/release_labels.json','w'), indent=0)
with open('RELEASES.md','w') as f:
    f.write('# Production releases (one per push to main)\n\nEach push to `main` deploys to production on Vercel. A release label `rel-<date>-<tip sha>` marks the push. Dates are US Eastern time from the local push log. Sep 6 releases arrived by fetch from another machine. Story ship commits are estimates from the roadmap and git history; bug ship commits come from the fixes. Rebuild with `jira/build_releases.py`.\n\n| Release label | Pushed (ET) | Tip commit | Issues first shipped |\n|---|---|---|---|\n')
    prev = None
    for d, h in tips:
        lb = label(d, h); subj = sh('git','log','-1','--format=%s',h).strip()[:70].replace('|','/')
        iss = ', '.join(sorted(releases.get(lb, {}).get('issues', []))) or '(docs, QA records or no tracked issue)'
        f.write(f'| {lb} | {d} | {h} {subj} | {iss} |\n')
print(len(tips), 'releases', len(out), 'issues labelled', len([r for r in releases]), 'releases with issues')
