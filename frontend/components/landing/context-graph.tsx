'use client';

import {useState} from 'react';
import {motion} from 'motion/react';
import {GlassCard, ListCard} from './glass';
import {Icon, type IconName} from './icons';
import {Connector, GlassCube, Place, Stage, StageSvg} from './stage';
import styles from './graph.module.css';

type Node = {
  id: string;
  title: string;
  icon: IconName;
  tone: 'violet' | 'blue' | 'cyan';
  items: {label: string; icon: IconName}[];
  x: number; y: number; w: number; z: number;
  link: {d: string; end: [number, number]; color: string};
};

const nodes: Node[] = [
  {id: 'files', title: 'Related Files', icon: 'branch', tone: 'violet', x: 36, y: 34, w: 158, z: 30,
    items: [{label: 'auth.py', icon: 'file'}, {label: 'middleware.py', icon: 'file'}, {label: 'routes.py', icon: 'file'}],
    link: {d: 'M262 178 C 256 128, 238 98, 194 98', end: [194, 98], color: '#c04cff'}},
  {id: 'deps', title: 'Dependencies', icon: 'package', tone: 'blue', x: 300, y: 0, w: 150, z: -10,
    items: [{label: 'fastapi', icon: 'package'}, {label: 'pydantic', icon: 'package'}, {label: 'starlette', icon: 'package'}],
    link: {d: 'M346 178 C 346 150, 368 142, 374 118', end: [374, 118], color: '#38cff8'}},
  {id: 'services', title: 'Services', icon: 'service', tone: 'blue', x: 486, y: 150, w: 154, z: 20,
    items: [{label: 'Auth Service', icon: 'service'}, {label: 'Database', icon: 'database'}, {label: 'Redis Cache', icon: 'layers'}],
    link: {d: 'M446 226 C 470 226, 464 206, 486 206', end: [486, 206], color: '#38cff8'}},
  {id: 'tests', title: 'Related Tests', icon: 'flask', tone: 'violet', x: 14, y: 304, w: 170, z: 40,
    items: [{label: 'test_auth.py', icon: 'flask'}, {label: 'test_routes.py', icon: 'flask'}, {label: 'test_middleware.py', icon: 'flask'}],
    link: {d: 'M226 298 C 226 336, 214 356, 184 356', end: [184, 356], color: '#c04cff'}},
  {id: 'context', title: 'Related Context', icon: 'file', tone: 'cyan', x: 332, y: 362, w: 190, z: 10,
    items: [{label: 'api.py', icon: 'file'}, {label: 'config.ts', icon: 'file'}, {label: 'database.py', icon: 'file'}],
    link: {d: 'M384 298 C 384 332, 420 334, 420 362', end: [420, 362], color: '#38cff8'}},
];

const cubes = [
  {x: -54, y: 168, size: 1.3, tone: 'violet', z: -80, delay: 0},
  {x: 548, y: 44, size: 1, tone: 'blue', z: -120, delay: 2},
  {x: 584, y: 404, size: 1.25, tone: 'cyan', z: -40, delay: 1},
  {x: 214, y: 448, size: .75, tone: 'violet', z: -60, delay: 3},
  {x: 210, y: -12, size: .6, tone: 'blue', z: -140, delay: 1.5},
  {x: 470, y: 312, size: .5, tone: 'violet', z: -30, delay: 2.6},
] as const;

export default function ContextGraph() {
  const [focus,setFocus]=useState<string|null>(null);

  return (
    <div className={styles.wrap}>
      <Stage width={640} height={520} tilt={3} rest={{x: 2, y: -4}}
        label="Illustration: a pull request change linked to its related files, dependencies, services, tests and supporting context.">
        {cubes.map((cube, index) => (
          <Place key={index} x={cube.x} y={cube.y} z={cube.z} float={8} duration={9} delay={cube.delay} className={styles.cube} reveal={.45+index*.04}>
            <GlassCube size={cube.size} tone={cube.tone}/>
          </Place>
        ))}
        <StageSvg>
          {nodes.map((node, index) => (
            <Connector key={node.id} d={node.link.d} from="#6c5cff" to={node.link.color} endpoint={node.link.end}
              pulse={index<3?4.6+index*.3:undefined} delay={.2 + index * .12} drawn
              active={focus === node.id} dimmed={focus !== null && focus !== node.id}/>
          ))}
        </StageSvg>
        <Place x={206} y={178} w={240} z={60} reveal={.02}>
          <div>
            <GlassCard tone="violet" strong className={styles.hub}>
              <div className={styles.hubHead}>
                <span><Icon name="branch" size="1.2em"/>PR CHANGE</span>
                <Icon name="arrow" size=".9em"/>
              </div>
              <div className={styles.hubStat}><span>+42</span><span>−6</span></div>
              <p>Improve user authentication flow</p>
              <div className={styles.hubBar}><i/><i/></div>
            </GlassCard>
          </div>
        </Place>
        {nodes.map((node, index) => (
          <Place key={node.id} x={node.x} y={node.y} w={node.w} z={node.z} float={10} duration={8} delay={index * 1.3} reveal={.15+index*.075}>
            <motion.div onPointerEnter={() => setFocus(node.id)} onPointerLeave={() => setFocus(null)}
              className={styles.node} data-dimmed={(focus !== null && focus !== node.id) || undefined}>
              <ListCard title={node.title} icon={node.icon} items={node.items} tone={node.tone}/>
            </motion.div>
          </Place>
        ))}
      </Stage>
    </div>
  );
}
