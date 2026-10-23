import type { places } from './content';
type Shop = typeof places[number];
export function ShopArt({ shop }: { shop: Shop }) {
  return <svg className={`shop-art ${shop.color}`} viewBox="0 0 180 150" aria-hidden="true">
    <ellipse cx="90" cy="137" rx="68" ry="9" fill="#303c2a" opacity=".09" />
    {shop.id === 'verify' ? <><path d="M59 131V48h62v83" fill="var(--wall)" stroke="#47513f" strokeWidth="2"/><path d="M52 49V31h16v9h15v-9h15v9h15v-9h15v18Z" fill="var(--roof)" stroke="#47513f" strokeWidth="2"/><circle cx="90" cy="69" r="14" fill="#f4ebd3" stroke="#47513f" strokeWidth="2"/><path d="M82 69l6 6 11-13" fill="none" stroke="#61724c" strokeWidth="3"/></> : <><path d="M33 69h114v62H33z" fill="var(--wall)" stroke="#47513f" strokeWidth="2"/><path d="M24 68l21-39h90l21 39z" fill="var(--roof)" stroke="#47513f" strokeWidth="2"/><path d="M45 29h90M39 40h102M32 53h116" stroke="#fff" strokeOpacity=".22" strokeWidth="2"/>
    <path d="M29 74h122v11H29z" fill="#f1e4c4" stroke="#47513f" strokeWidth="1.5"/>{[35,59,83,107,131].map(x=><path key={x} d={`M${x} 74v11h12V74`} fill="var(--roof)" opacity=".8"/>)}</>}
    <path d="M76 131V97q14-12 28 0v34" fill="#485a46" stroke="#47513f" strokeWidth="2"/><path d="M38 132h104" stroke="#47513f" strokeWidth="3"/><circle cx="97" cy="115" r="2" fill="#e6c982"/>
    {shop.id !== 'verify' && <><rect x="43" y="94" width="23" height="23" rx="2" fill="#ecdfb8" stroke="#47513f" strokeWidth="2"/><path d="M55 94v23M43 105h23" stroke="#47513f"/><rect x="114" y="94" width="23" height="23" rx="2" fill="#ecdfb8" stroke="#47513f" strokeWidth="2"/><path d="M125 94v23M114 105h23" stroke="#47513f"/></>}
    <path d="M20 130v-16m-5 6q5-20 10 0" stroke="#677b55" strokeWidth="4" fill="none"/><rect x="155" y="119" width="10" height="13" fill="#b78b63"/><circle cx="160" cy="115" r="9" fill="#7e9166"/>
    <rect x="67" y="48" width="46" height="23" rx="3" fill="#f8f2e3" stroke="#47513f" strokeWidth="1.5"/><text x="90" y="65" textAnchor="middle" fill="#47513f" fontFamily="Georgia, serif" fontSize="16" fontWeight="bold">{shop.mark}</text>
  </svg>;
}
