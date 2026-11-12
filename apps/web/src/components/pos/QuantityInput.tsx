'use client';
import {useEffect,useState} from 'react';
export default function QuantityInput({name,value,stock,onCommit}:{name:string;value:number;stock:number;onCommit:(value:number)=>void}){
  const [text,setText]=useState(String(value));
  useEffect(()=>setText(String(value)),[value]);
  return <input aria-label={`${name} quantity`} type="number" inputMode="decimal" min="0.001" step="any" max={stock} value={text} onChange={e=>setText(e.target.value)} onBlur={e=>{
    const next=Number(text);
    if(text.trim()&&Number.isFinite(next)&&next>0&&next<=stock){e.target.setCustomValidity('');onCommit(next);}
    else {e.target.setCustomValidity('Enter a quantity greater than zero and within available stock.');e.target.reportValidity();setText(String(value));}
  }} onFocus={e=>e.target.setCustomValidity('')} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
