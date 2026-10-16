import type {RefObject} from 'react';

/** Shared, renderer-independent progress channel for this and future story stages. */
export type SceneProgress = RefObject<{value:number;scrolling:boolean}>;
export type Point = [number,number,number];
export const phase = (value:number,start:number,end:number) => {
  const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
  return t*t*(3-2*t);
};
export const blendPoint = (from:Point,to:Point,t:number):Point => from.map((v,i)=>v+(to[i]-v)*t) as Point;
export type RepositoryNode = {name:string;position:Point;target:Point;color:string;scale:number;tilt:number;reveal?:number;role:'changed'|'context'|'dependency'|'secondary'};
export const repositoryNodes:RepositoryNode[] = [
  {name:'auth.py',position:[-2.55,1.9,-.7],target:[-3,1.1,.1],color:'#8b5cf6',scale:.92,tilt:.09,role:'changed'},
  {name:'routes.py',position:[2.35,1.85,-1.1],target:[1.5,1.1,.05],color:'#3978ff',scale:.8,tilt:-.1,role:'context'},
  {name:'api.py',position:[-2.7,-.5,.9],target:[1.5,-.45,.15],color:'#8b5cf6',scale:1.12,tilt:.08,role:'changed'},
  {name:'users.py',position:[2.65,.15,-.1],target:[2.7,2.4,-.15],color:'#3978ff',scale:.95,tilt:-.1,role:'context'},
  {name:'tests.py',position:[-.95,-2.05,.7],target:[-3,-.7,.1],color:'#3978ff',scale:1.02,tilt:-.06,role:'context'},
  {name:'config.ts',position:[2.1,-1.9,1],target:[.2,-2.5,-.2],color:'#38cff8',scale:1.12,tilt:-.13,role:'dependency'},
  {name:'types.ts',position:[.45,2.65,-1.8],target:[-1.2,2.5,-.25],color:'#607393',scale:.65,tilt:.06,role:'secondary'},
  {name:'middleware.py',position:[-.5,1.1,-.7],target:[-.7,1.1,0],color:'#38cff8',scale:.8,tilt:.03,reveal:.36,role:'dependency'},
  {name:'database.py',position:[2.1,-.15,-.6],target:[2.7,-1.9,.3],color:'#38cff8',scale:.88,tilt:-.05,reveal:.46,role:'dependency'},
  {name:'utils.py',position:[.2,-1.8,-1],target:[-.6,-1.7,-.15],color:'#3978ff',scale:.75,tilt:.05,reveal:.58,role:'context'},
];
export const nodePosition = (node:RepositoryNode,progress:number) => blendPoint(node.position,node.target,phase(progress,.2,.8));

export type ScenePose = {position:Point;rotation:Point;scale:number;opacity:number;emphasis:number};
export const sceneStates = {
  hero: {
    camera:{position:[0,0,10.8],rotation:[0,0,0],scale:1,opacity:1,emphasis:1},
    pullRequest:{position:[.05,.08,.1],rotation:[0,0,0],scale:1.22,opacity:1,emphasis:1},
    platform:{position:[0,0,0],rotation:[0,0,0],scale:1,opacity:1,emphasis:1},
  },
  repository: {
    camera:{position:[-.2,.18,12.35],rotation:[0,0,0],scale:1,opacity:1,emphasis:1},
    pullRequest:{position:[-.3,-.25,.15],rotation:[0,0,0],scale:.5,opacity:1,emphasis:.7},
    platform:{position:[0,-.9,-.9],rotation:[0,0,0],scale:.78,opacity:1,emphasis:.55},
  },
} satisfies Record<string,Record<string,ScenePose>>;
export function interpolatePose(from:ScenePose,to:ScenePose,t:number):ScenePose {
  return {position:blendPoint(from.position,to.position,t),rotation:blendPoint(from.rotation,to.rotation,t),scale:from.scale+(to.scale-from.scale)*t,opacity:from.opacity+(to.opacity-from.opacity)*t,emphasis:from.emphasis+(to.emphasis-from.emphasis)*t};
}
export function nodeSceneStates(node:RepositoryNode):{hero:ScenePose;repository:ScenePose} {
  return {
    hero:{position:node.position,rotation:[.04,-.08,node.tilt],scale:node.scale,opacity:node.reveal===undefined?1:0,emphasis:1},
    repository:{position:node.target,rotation:[0,0,0],scale:node.scale*.95,opacity:1,emphasis:node.role==='changed'?1.3:.65},
  };
}

export const repositoryRelationships = [
 ['auth.py','middleware.py'],['middleware.py','routes.py'],['routes.py','api.py'],
 ['api.py','database.py'],['tests.py','auth.py'],['routes.py','users.py'],
 ['database.py','config.ts'],['api.py','utils.py'],['utils.py','config.ts'],['types.ts','routes.py'],
] as const;
export function isRelatedNode(name:string,selected:string|null) {
 return !selected||name===selected||repositoryRelationships.some(([from,to])=>(from===selected&&to===name)||(to===selected&&from===name));
}
export const repositoryHub:RepositoryNode={name:'PR CHANGE',position:[.05,.08,.1],target:[-.3,-.25,.15],color:'#6752cd',role:'changed',scale:1,tilt:0};
