'use client';
import {useState} from 'react';
import AppShell, {CommandBar} from './workspace/shell';
import WorkspaceContent from './workspace/content';
import useReviewWorkspace from './workspace/use-review-workspace';
import {workspaceData} from './workspace/data';
import type {SectionId} from './workspace/types';
export default function Home() {
  const workspace=useReviewWorkspace();
  const [section,setSection]=useState<SectionId>('overview');
  const [preview,setPreview]=useState<{reviewId:string;count:number;value:unknown}|null>(null);
  const data=workspaceData(workspace);
  const previewCount=preview?.reviewId===workspace.agents?.review_id?preview?.count:undefined;
  return <AppShell workspace={data.pr?`${data.pr.repository} #${data.pr.pull_request}`:undefined} active={section} onSelect={setSection} counts={data.counts}
    command={<CommandBar repository={workspace.repository} pullRequest={workspace.pullRequest} busy={workspace.busy} loaded={!!workspace.analysis}
      loading={workspace.loading} reviewing={workspace.reviewing}
      onRepository={value=>{workspace.setRepository(value);workspace.clearResults();}}
      onPullRequest={value=>{workspace.setPullRequest(value);workspace.clearResults();}}
      onLoad={event=>{setSection('overview');void workspace.analyze(event);}}
      onReview={()=>{setSection('overview');void workspace.analyzeWithAI();}}/>}>
    <WorkspaceContent section={section} workspace={workspace} data={data} previewCount={previewCount} onSelect={setSection}
      savedPreview={preview?.reviewId===workspace.agents?.review_id?preview?.value:undefined}
      onPreview={(reviewId,value)=>setPreview(previous=>({reviewId,value,count:previous?.reviewId===reviewId?previous.count+1:1}))}/>
  </AppShell>;
}
