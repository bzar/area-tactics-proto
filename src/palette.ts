/** TwilioQuest-76 palette — https://lospec.com/palette-list/twilioquest-76 */
export const palette = {
  // Neutrals
  white:       '#ffffff',
  grayLight:   '#eaeae8',
  gray:        '#cecac9',
  grayBlue:    '#abafb9',
  mauve:       '#a18897',
  plumLight:   '#756276',
  plum:        '#5d4660',
  plumDark:    '#4c3250',
  purpleDark:  '#432641',
  blackPurple: '#28192f',
  // Reds / Pinks
  salmonLight: '#fb7575',
  hotPink:     '#fb3b64',
  crimson:     '#c83157',
  rose:        '#8e375c',
  darkPink:    '#4f2351',
  deepPink:    '#351544',
  redBright:   '#f74a53',
  red:         '#f22f46',
  redDark:     '#bc1642',
  // Oranges / Yellows
  gold:        '#fcc539',
  orange:      '#f87b1b',
  orangeRed:   '#f8401b',
  redOrange:   '#bd2709',
  maroon:      '#7c122b',
  yellowLight: '#ffe08b',
  golden:      '#fac05a',
  peachOrange: '#eb8f48',
  brownOrange: '#d17441',
  rustOrange:  '#c75239',
  brownRed:    '#b12935',
  // Flesh / Earth
  peach:       '#fdbd8f',
  salmonPeach: '#f0886b',
  terracotta:  '#d36853',
  dustyRed:    '#ae454a',
  darkBrick:   '#8c3132',
  darkRed:     '#542323',
  brownPink:   '#a85848',
  roseBrown:   '#83404c',
  plumBrown:   '#67314b',
  darkBrown:   '#3f2323',
  tan:         '#d49577',
  medBrown:    '#9f705a',
  brownDark:   '#845750',
  chestnut:    '#633b3f',
  // Greens (teal)
  mintLight:   '#7bd7a9',
  mint:        '#52b281',
  tealMid:     '#148568',
  tealDark:    '#146756',
  deepTeal:    '#22474c',
  blackTeal:   '#102f34',
  // Greens (bright)
  limeLight:   '#ebff8b',
  limeGreen:   '#b3e363',
  green:       '#4cbd56',
  greenDark:   '#2f8735',
  forestGreen: '#0b5931',
  sage:        '#97bf6e',
  sageMid:     '#899f66',
  sageDark:    '#61855a',
  sageDeep:    '#4c6051',
  // Blues / Cyans
  cyanLight:   '#73dff2',
  cyan:        '#2abbd0',
  blue:        '#315dcd',
  indigoDark:  '#472a9c',
  iceMist:     '#a0d8d7',
  skyLight:    '#7dbefa',
  steelBlue:   '#668faf',
  slateBlue:   '#585d81',
  deepSlate:   '#45365d',
  // Purples
  lavender:    '#f6bafe',
  lilac:       '#d59ff4',
  violet:      '#b070eb',
  purple:      '#7c3ce1',
  // Warm neutrals
  linen:       '#dbcfb1',
  khaki:       '#a9a48d',
  warmGray:    '#7b8382',
  coolGray:    '#5f5f6e',
} as const;

// ── Semantic aliases used by the game ─────────────────────────────────────────
export const colors = {
  // Surfaces (darkest → lightest)
  bgDeep:      palette.blackPurple,   // #28192f  body/deepest bg
  bgDark:      palette.purpleDark,    // #432641  secondary surfaces
  bgPanel:     palette.blackTeal,     // #102f34  panel/button background
  bgRaise:     palette.deepTeal,      // #22474c  hover / raised elements
  bgUi:        palette.slateBlue,     // #585d81  UI control backgrounds
  bgDim:       palette.deepSlate,     // #45365d  subtle borders / very dim bg

  // Borders
  border:      palette.slateBlue,     // #585d81  standard border
  borderLo:    palette.deepSlate,     // #45365d  subtle border

  // Text
  textHi:      palette.grayLight,     // #eaeae8  brightest text
  text:        palette.iceMist,       // #a0d8d7  primary UI text
  textLo:      palette.steelBlue,     // #668faf  labels / secondary text
  textDim:     palette.coolGray,      // #5f5f6e  very dim / disabled text

  // Accent / interactive
  accent:      palette.blue,          // #315dcd  primary accent blue
  accentHi:    palette.skyLight,      // #7dbefa  accent highlight

  // Player colors
  p1:          palette.blue,          // #315dcd  player 1 (blue)
  p1Bg:        palette.indigoDark,    // #472a9c  player 1 dark background
  p2:          palette.orange,        // #f87b1b  player 2 (orange)
  p2Bg:        palette.redOrange,     // #bd2709  player 2 dark background

  // Status
  green:       palette.green,         // #4cbd56  success / active
  greenBg:     palette.forestGreen,   // #0b5931  green background
  greenHi:     palette.mintLight,     // #7bd7a9  bright mint (construction)
  red:         palette.redBright,     // #f74a53  error / destroyed
  redHi:       palette.salmonLight,   // #fb7575  softer red
  orange:      palette.orange,        // #f87b1b  warning / cancelled
  yellow:      palette.gold,          // #fcc539  gold / game-over

  // Misc
  white:       palette.white,         // #ffffff
  gray:        palette.grayBlue,      // #abafb9
  khaki:       palette.khaki,         // #a9a48d  neutral warm gray
} as const;
