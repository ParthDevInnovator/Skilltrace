"""50-user authenticated load runner: python phase5_load.py --token TOKEN."""
import argparse, asyncio, statistics, time
import httpx

async def worker(client, headers, stop, results, wait_seconds):
    while time.monotonic()<stop:
        for method,path,json in [('GET','/api/v1/candidates',None),('POST','/api/v1/jd/rank',{'job_id':'JOB-001'})]:
            start=time.perf_counter()
            try:r=await client.request(method,path,headers=headers,json=json);results.append((path,(time.perf_counter()-start)*1000,r.status_code))
            except httpx.HTTPError:results.append((path,(time.perf_counter()-start)*1000,599))
        await asyncio.sleep(wait_seconds)
async def main(token,duration,wait_seconds):
    results=[]
    async with httpx.AsyncClient(base_url='http://127.0.0.1:8000',timeout=10) as client:await asyncio.gather(*(worker(client,{'Authorization':f'Bearer {token}'},time.monotonic()+duration,results,wait_seconds) for _ in range(50)))
    for path in {x[0] for x in results}:
        values=[x[1] for x in results if x[0]==path];errors=sum(x[2]>=400 and x[2]!=429 for x in results if x[0]==path)
        print(path,'requests',len(values),'p95_ms',round(statistics.quantiles(values,n=20)[18],2),'error_rate',round(errors/len(values),4))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--token',required=True);parser.add_argument('--duration',type=int,default=60);parser.add_argument('--wait',type=float,default=1.0,help='User think time after each candidates/rank cycle');args=parser.parse_args();asyncio.run(main(args.token,args.duration,args.wait))
