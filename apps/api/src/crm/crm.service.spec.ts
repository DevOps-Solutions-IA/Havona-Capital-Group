import {CrmService} from './crm.service';

describe('CrmService',()=>{
 const consultant={id:'11111111-1111-4111-8111-111111111111',permissions:['crm.read_assigned','crm.opportunities','crm.tasks.own']};
 it('limita la bandeja del consultor a asignaciones activas',async()=>{
  const db={prospect:{findMany:jest.fn().mockResolvedValue([]),count:jest.fn().mockResolvedValue(0)},$transaction:jest.fn(async(values:Promise<unknown>[])=>Promise.all(values))} as any;
  const service=new CrmService(db,{record:jest.fn()} as any);
  await service.prospects({page:1,pageSize:25,sortBy:'lastCapturedAt',sortOrder:'desc'},consultant);
  expect(db.prospect.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({assignments:{some:{assigneeId:consultant.id,endedAt:null}}})}));
 });

 it('exige resultado explícito al mover una oportunidad a Cerrado',async()=>{
  const db={opportunity:{findFirst:jest.fn().mockResolvedValue({id:'opp',prospectId:'prospect',stageId:'old',status:'OPEN',stage:{key:'new'}})},pipelineStage:{findFirst:jest.fn().mockResolvedValue({id:'closed',key:'closed',name:'Cerrado'})},$transaction:jest.fn()} as any;
  const service=new CrmService(db,{record:jest.fn()} as any);
  await expect(service.moveOpportunity('opp',{stageId:'closed'},consultant,{auth:{user:consultant},headers:{}})).rejects.toThrow('Debe indicar el resultado');
  expect(db.$transaction).not.toHaveBeenCalled();
 });

 it('impide que un consultor actualice tareas ajenas',async()=>{
  const db={task:{findFirst:jest.fn().mockResolvedValue(null)}} as any;
  const service=new CrmService(db,{record:jest.fn()} as any);
  await expect(service.taskStatus('task','COMPLETED' as any,consultant,{auth:{user:consultant},headers:{}})).rejects.toThrow('Tarea no encontrada');
  expect(db.task.findFirst).toHaveBeenCalledWith({where:{id:'task',assigneeId:consultant.id,prospect:{assignments:{some:{assigneeId:consultant.id,endedAt:null}}}}});
 });
});
