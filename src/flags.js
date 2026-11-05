/** Экспериментальные возможности: включаются в отдельной сборке (android/build_exp.sh) или на сайте по адресу с ?exp. */
export const EXP_BUILD = false;
export const EXPERIMENTAL = EXP_BUILD || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('exp'));
