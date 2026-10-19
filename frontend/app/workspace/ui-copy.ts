export function countLabel(count:number,singular:string,plural=`${singular}${/(s|x|z|ch|sh)$/.test(singular)?'es':'s'}`) {
  return `${count} ${count===1?singular:plural}`;
}
