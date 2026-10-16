'use client';
import {useSyncExternalStore} from 'react';

const query='(prefers-reduced-motion: reduce)';
const subscribe=(notify:()=>void)=>{const media=window.matchMedia(query);media.addEventListener('change',notify);return()=>media.removeEventListener('change',notify);};
const snapshot=()=>window.matchMedia(query).matches;
const serverSnapshot=()=>false;
/** Keep the first hydration render identical to SSR, then adopt the user's preference. */
export function useReducedMotion(){return useSyncExternalStore(subscribe,snapshot,serverSnapshot);}
