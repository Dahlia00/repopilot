'use client';

import {useLayoutEffect, useRef, type RefObject} from 'react';
import gsap from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';

/** One master timeline, two designed rests; no wheel interception or carousel state. */
export function useScrollStory(stage:RefObject<HTMLDivElement|null>,hero:RefObject<HTMLDivElement|null>,copy:RefObject<HTMLDivElement|null>) {
  const progress=useRef({value:0,scrolling:false});
  useLayoutEffect(()=>{
    const channel=progress.current;
    gsap.registerPlugin(ScrollTrigger);
    const media=gsap.matchMedia();
    const context=gsap.context(()=>{
      media.add('(min-width: 768px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)',()=>{
        if(!stage.current||!hero.current||!copy.current)return;
        const root=stage.current,original=hero.current,next=copy.current;
        const resting=gsap.delayedCall(.18,()=>{channel.scrolling=false;}).pause();
        next.inert=true;
        gsap.set(next,{autoAlpha:0,y:220});
        const timeline=gsap.timeline({defaults:{ease:'none'},scrollTrigger:{
          id:'repopilot-scenes',trigger:root,start:'top top',
          end:()=>`+=${window.innerHeight*(window.innerWidth<=1100?.65:.85)}`,
          pin:true,scrub:.35,anticipatePin:1,invalidateOnRefresh:true,
          snap:{snapTo:'labelsDirectional',duration:{min:.25,max:.65},delay:.05,ease:'power2.inOut',inertia:false},
        },onUpdate:()=>{
          const value=channel.value;
          channel.scrolling=true;resting.restart(true);
          original.inert=value>.68;next.inert=value<.5;
          root.style.setProperty('--context-progress',String(value));
        }});
        timeline.addLabel('sceneHero',0)
          .to(channel,{value:1,duration:1},0)
          .to(original,{y:-150,autoAlpha:0,duration:.3},.4)
          .to(original.querySelectorAll('[data-hero-actions], [data-hero-description]'),{autoAlpha:0,duration:.16},.34)
          .to(root.querySelector('[data-repository-visual]'),{x:-16,duration:.45},.25)
          .to(root,{'--scene-light':1,duration:.4},.4)
          .to(root,{'--nav-ink':'#101321','--nav-muted':'#566177','--nav-border':'rgba(16,19,33,.1)','--mark-ink':'#6356d7',duration:.2},.7)
          .to(root,{'--wash-base':'#f7f9ff',duration:.25},.6)
          .to(next,{autoAlpha:1,duration:.25},.45)
          .to(next,{y:0,duration:.3},.56)
          .fromTo(next.querySelectorAll('[data-context-body]'),{autoAlpha:0},{autoAlpha:1,duration:.17},.65)
          .addLabel('sceneRepository',1);
        void document.fonts.ready.then(()=>{if(stage.current)ScrollTrigger.refresh();});
        return ()=>{
          resting.kill();timeline.kill();channel.value=0;channel.scrolling=false;
          original.inert=false;next.inert=false;root.style.removeProperty('--context-progress');
        };
      });
    },stage);
    return()=>{media.revert();context.revert();channel.value=0;channel.scrolling=false;};
  },[stage,hero,copy]);
  return progress;
}
