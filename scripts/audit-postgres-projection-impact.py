#!/usr/bin/env python3
# Diagnostic baseline: expected gaps are success, not qualified feature behavior.
# Requires the local image pg-mindbrain:3.4-86689a4. Only its disposable container is mutated.
import subprocess,json,pathlib,tempfile,time,hashlib,re,uuid,sys
root=pathlib.Path(__file__).resolve().parents[1]
pg=root.parent/'pg_mindbrain'
out=root/'reports/validation/postgres-projection-impact-20260913'
out.mkdir(parents=True,exist_ok=True)
name='pgmb-projection-audit-'+uuid.uuid4().hex[:10]
image='pg-mindbrain:3.4-86689a4'
receipt={'schema':'ghostcrab/postgres-projection-impact/v1','image':image,'container':name,'source_commit':subprocess.check_output(['git','-C',str(pg),'rev-parse','HEAD'],text=True).strip(),'main_commit':subprocess.check_output(['git','-C',str(pg),'rev-parse','main'],text=True).strip(),'calls':[]}
def run(args,**kw): return subprocess.run(args,check=True,capture_output=True,text=True,**kw)
def sql(s,record=True):
 p=run(['docker','exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],input=s)
 if record: receipt['calls'].append({'sql':s,'stdout':p.stdout,'stderr':p.stderr})
 return p.stdout.strip()
def value(s): return json.loads(sql(s))
try:
 receipt['image_id']=run(['docker','image','inspect',image,'--format','{{.Id}}']).stdout.strip()
 run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','--tmpfs','/docker-entrypoint-initdb.d:ro','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres',image,'postgres','-c','shared_preload_libraries=pg_mindbrain,pg_cron','-c','cron.database_name=postgres','-c','pg_mindbrain.bg_worker_enabled=off'])
 for i in range(45):
  p=subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True)
  if p.returncode==0: break
  time.sleep(1)
 else: raise RuntimeError('isolated postgres did not start')
 sql('CREATE EXTENSION pg_mindbrain CASCADE;')
 receipt['runtime']=value("SELECT json_build_object('extension',extversion,'server',current_setting('server_version')) FROM pg_extension WHERE extname='pg_mindbrain';")
 assert receipt['runtime']['extension']=='3.4'
 receipt['function_bodies_match_checkout_and_main']={}
 source=(pg/'sql/src/canonical/33_mb_pragma-functions.sql').read_text()
 main=run(['git','-C',str(pg),'show','main:sql/src/canonical/33_mb_pragma-functions.sql']).stdout
 for fn in ['answer_artifact_create','answer_artifact_get','answer_artifact_refresh']:
  pattern=r'CREATE OR REPLACE FUNCTION mb_core\.'+fn+r'\(.*?AS \$\$(.*?)\$\$;'
  body=re.search(pattern,source,re.S).group(1)
  assert body==re.search(pattern,main,re.S).group(1)
  md5=hashlib.md5(body.encode()).hexdigest()
  actual=sql("SELECT md5(prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mb_core' AND proname='"+fn+"';")
  assert md5==actual,(fn,md5,actual)
  receipt['function_bodies_match_checkout_and_main'][fn]=md5
 # Run existing registry regression on this disposable database only.
 result=run(['docker','exec','-i',name,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=(pg/'test/sql/pragma/answer_artifacts_test.sql').read_text())
 (out/'existing-answer-artifacts-test.log').write_text('\n'.join(line.rstrip() for line in (result.stdout+result.stderr).splitlines())+'\n')
 receipt['existing_registry_suite']='passed'
 sql("SELECT mb_core.ensure_workspace('projection_impact','Isolated projection impact');")
 for slug,operation in [('sum','group_sum'),('missing','missing_inbound')]:
  definition=json.dumps({'projection_contract':{'version':999,'ontology_id':'missing::ontology','operation':operation,'business_question':slug}})
  result=value("SELECT mb_core.answer_artifact_create('projection_impact','"+slug+"','"+slug+"',$def$"+definition+"$def$::jsonb);")
  assert result['created'] is True
 refresh=[]
 for slug in ['sum','missing']:
  r=value("SELECT mb_core.answer_artifact_refresh('projection_impact','live_answer_view__"+slug+"');")
  mat=r['artifact']['payload_json']['materialized']
  assert mat['fact_count']==0 and mat['entity_count']==0
  assert 'rows' not in mat and 'qualified_result' not in r['artifact']['payload_json']
  refresh.append({k:v for k,v in mat.items() if k!='refreshed_at'})
 assert refresh[0]==refresh[1]
 sql("INSERT INTO mb_graph.entity(workspace_id,type,name,metadata) VALUES ('projection_impact','unit','Changed after refresh','{}');")
 read=value("SELECT mb_core.answer_artifact_get('live_answer_view__sum','{\"workspace_id\":\"projection_impact\",\"expected_version\":999,\"expected_source_digest\":\"deliberately_wrong\",\"include_answer\":true}'::jsonb);")
 assert read['found'] is True and read['artifact']['state']=='active'
 assert read['artifact']['payload_json']['materialized']['entity_count']==0
 assert sql("SELECT count(*) FROM mb_graph.entity WHERE workspace_id='projection_impact';")=='1'
 forged=value("SELECT mb_core.answer_artifact_create('projection_impact','caller_result','Caller result','{\"qualified_result\":{\"status\":\"ready\",\"rows\":[{\"total\":1000}]}}'::jsonb);")
 assert forged['created'] is True
 receipt['gaps']={'invalid_projection_contract_accepted':True,'different_contracts_produce_same_workspace_counts':True,'refresh_reads_agent_facts':True,'source_mutation_not_checked_by_get':True,'expected_binding_options_ignored':True,'caller_qualified_result_not_reserved':True,'qualified_answer_and_ontology_not_produced':True}
 receipt['conclusion']='baseline_gaps_reproduced_not_feature_qualified'
 print(json.dumps({'runtime':receipt['runtime'],'suite':receipt['existing_registry_suite'],'gaps':receipt['gaps']},indent=2))
except Exception as error:
 receipt['conclusion']='audit_failed'; receipt['error']=str(error)
 if isinstance(error,subprocess.CalledProcessError): receipt['stdout']=error.stdout;receipt['stderr']=error.stderr
 print(json.dumps(receipt,indent=2));sys.exit(1)
finally:
 logs=subprocess.run(['docker','logs',name],capture_output=True,text=True)
 (out/'backend.log').write_text(logs.stdout+logs.stderr)
 removed=subprocess.run(['docker','rm','-f',name],capture_output=True,text=True)
 receipt['isolated_container_removed']=removed.returncode==0
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
