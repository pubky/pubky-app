/**
 * The language codes of the open Wikipedias (Wikimedia's site matrix, 2026-11: 348), as their hosts
 * and Pinakes' `Wikipedia (xx)` names spell them: what Links and Media's Wikipedia languages offer.
 */
export const WIKIPEDIA_LANGUAGES: readonly string[] = `
  ab ace ady af als alt am ami an ang ann anp ar arc ary arz as ast atj av avk awa ay az azb ba ban bar bat-smg bbc
  bcl bdr be be-tarask bew bg bh bi bjn blk bm bn bo bol bpy br bs btm bug bxr ca cbk-zam cdo ce ceb ch chr chy ckb co
  crh cs csb cu cv cy da dag de dga din diq dsb dtp dty dv dz ee el eml en eo es et eu ext fa fat ff fi fiu-vro fj fo
  fon fr frp frr fur fy ga gag gan gcr gd gl glk gn gom gor got gpe gu guc gur guw gv ha hak haw he hi hif hr hsb ht
  hu hy hyw ia iba id ie ig igl ik ilo inh io is isv it iu ja jam jbo jv ka kaa kab kai kaj kbd kbp kcg kg kge ki kk
  km kn knc ko koi krc ks ksh ku kus kv kw ky la lad lb lbe lez lfn lg li lij lld lmo ln lo lt ltg lv mad mag mai
  map-bms mdf mg mhr mi min mk ml mn mni mnw mos mr mrj ms mt mwl my myv mzn nah nap nds nds-nl ne new nia nl nn no
  nov nqo nr nrm nso nup nv ny oc olo om or os pa pag pam pap pcd pcm pdc pfl pi pl pms pnb pnt ppl ps pt pwn qu rki
  rm rmy rn ro roa-rup roa-tara rsk ru rue rw sa sah sat sc scn sco sd se sg sh shi shn si simple sk skr sl sm smn sn
  so sq sr srn ss st stq su sv sw syl szl szy ta tay tcy tdd te tet tg th ti tig tk tl tly tn to tok tpi tr trv ts tt
  tum tw ty tyv udm ug uk ur uz ve vec vep vi vls vo wa war wo wuu xal xh xmf yi yo za zea zgh zh zh-classical
  zh-min-nan zh-yue zu
`
  .trim()
  .split(/\s+/);
