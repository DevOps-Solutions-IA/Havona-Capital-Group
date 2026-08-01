import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {HomeNarrative} from './home-narrative';

vi.mock('motion/react',async()=>{const React=await import('react');type MotionProps=React.HTMLAttributes<HTMLDivElement>&{initial?:unknown;whileInView?:unknown;viewport?:unknown;transition?:unknown;animate?:unknown;exit?:unknown};const MotionDiv=React.forwardRef<HTMLDivElement,MotionProps>(({initial,whileInView,viewport,transition,animate,exit,...props},ref)=>{void[initial,whileInView,viewport,transition,animate,exit];return <div ref={ref} {...props}/>});MotionDiv.displayName='MotionDiv';const MotionI=React.forwardRef<HTMLElement,React.HTMLAttributes<HTMLElement>>((props,ref)=><i ref={ref} {...props}/>);MotionI.displayName='MotionI';return{AnimatePresence:({children}:{children:React.ReactNode})=><>{children}</>,motion:{div:MotionDiv,i:MotionI},useReducedMotion:()=>true,useScroll:()=>({scrollYProgress:0}),useSpring:()=>0}});

describe('narrativa pública de Home',()=>{
 it('permite explorar soluciones con mouse y teclado',async()=>{render(<HomeNarrative/>);const pension=screen.getByRole('tab',{name:/Pensión/});fireEvent.click(pension);expect(screen.getByRole('heading',{name:'Dar estructura al futuro que quiere vivir.'})).toBeInTheDocument();fireEvent.keyDown(pension,{key:'ArrowRight'});await waitFor(()=>expect(screen.getByRole('tab',{name:/Educación/})).toHaveFocus());expect(screen.getByRole('heading',{name:'Acompañar proyectos que transforman generaciones.'})).toBeInTheDocument()});
});
