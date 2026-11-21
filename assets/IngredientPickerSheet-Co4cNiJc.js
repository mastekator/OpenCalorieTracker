import{n as e}from"./rolldown-runtime-sJBDdmOt.js";import{t}from"./react-DlPsW1c0.js";import{i as n,r}from"./i18n-wd0pTQQj.js";import{t as i}from"./jsx-runtime-MKhVqBIO.js";import{n as a,t as o}from"./Field-B_X5HO4A.js";import{n as s,t as c}from"./pencil--phcQLUl.js";import{n as l,t as u}from"./rotate-ccw-clock-Ba7APf2M.js";import{n as d,r as f,t as p}from"./List-hfysad13.js";import{n as m,t as h}from"./Sheet-Bs8Y-IFe.js";function g({search:e,onPick:t,onManual:r,onClose:i}){let{t:a,num:s,locale:l}=n(),[f,m]=(0,_.useState)(``),[g,y]=(0,_.useState)([]),b=f.trim();return(0,_.useEffect)(()=>{let t=!0;return b?e(b).then(e=>t&&y(e),()=>{}):y([]),()=>{t=!1}},[b,e]),(0,v.jsx)(h,{open:!0,onClose:i,title:a(`editor.ingredient`),children:(0,v.jsxs)(`div`,{className:`ingredient-picker`,children:[(0,v.jsx)(o,{label:a(`editor.search`),type:`search`,autoComplete:`off`,maxLength:80,autoFocus:!0,value:f,onChange:e=>m(e.target.value)}),g.length>0&&(0,v.jsx)(p,{title:(0,v.jsxs)(`span`,{className:`ingredient-picker__group`,children:[(0,v.jsx)(u,{"aria-hidden":`true`}),a(`editor.from_history`)]}),children:g.map(e=>(0,v.jsx)(d,{description:a(`editor.history_sub`,{k:s(e.kcal/e.grams*100),date:new Date(e.eatenAt).toLocaleDateString(l,{day:`numeric`,month:`short`})}),onClick:()=>t(e),children:e.name},e.name))}),(0,v.jsx)(p,{footer:a(`editor.picker_note`),children:(0,v.jsx)(d,{accent:!0,icon:(0,v.jsx)(c,{}),onClick:()=>r(b),children:b?a(`editor.enter_manually`,{q:b}):a(`recipes.manual`)})})]})})}var _,v;function y(){return(y=e((()=>{_=t(),l(),s(),r(),a(),f(),m(),v=i(),g.__docgenInfo={description:`«+ Ingredient» (OCT-160 2.5): search the history, or enter by hand. Wave 1: no
«From fridge» group. The editor mounts it while open.`,methods:[],displayName:`IngredientPickerSheet`,props:{search:{required:!0,tsType:{name:`signature`,type:`function`,raw:`(query: string) => Promise<HistoryDish[]>`,signature:{arguments:[{type:{name:`string`},name:`query`}],return:{name:`Promise`,elements:[{name:`Array`,elements:[{name:`intersection`,raw:`Nutrients & {
  name: string;
  grams: number;
  unit?: DishUnit;
  eatenAt: string;
}`,elements:[{name:`Nutrients`},{name:`signature`,type:`object`,raw:`{
  name: string;
  grams: number;
  unit?: DishUnit;
  eatenAt: string;
}`,signature:{properties:[{key:`name`,value:{name:`string`,required:!0}},{key:`grams`,value:{name:`number`,required:!0}},{key:`unit`,value:{name:`DishUnit`,required:!1}},{key:`eatenAt`,value:{name:`string`,required:!0}}]}}]}],raw:`HistoryDish[]`}],raw:`Promise<HistoryDish[]>`}}},description:`Dishes from the diary matching the query (findHistoryDishes).`},onPick:{required:!0,tsType:{name:`signature`,type:`function`,raw:`(dish: HistoryDish) => void`,signature:{arguments:[{type:{name:`intersection`,raw:`Nutrients & {
  name: string;
  grams: number;
  unit?: DishUnit;
  eatenAt: string;
}`,elements:[{name:`Nutrients`},{name:`signature`,type:`object`,raw:`{
  name: string;
  grams: number;
  unit?: DishUnit;
  eatenAt: string;
}`,signature:{properties:[{key:`name`,value:{name:`string`,required:!0}},{key:`grams`,value:{name:`number`,required:!0}},{key:`unit`,value:{name:`DishUnit`,required:!1}},{key:`eatenAt`,value:{name:`string`,required:!0}}]}}]},name:`dish`}],return:{name:`void`}}},description:``},onManual:{required:!0,tsType:{name:`signature`,type:`function`,raw:`(query: string) => void`,signature:{arguments:[{type:{name:`string`},name:`query`}],return:{name:`void`}}},description:`«Enter “…” manually»: the typed text becomes the name.`},onClose:{required:!0,tsType:{name:`signature`,type:`function`,raw:`() => void`,signature:{arguments:[],return:{name:`void`}}},description:``}}}})))()}export{y as n,g as t};