import type { Preset } from '../types';

export const PRESETS: readonly Preset[] = [
  {
    name: 'Flywheel',
    source: 'r>15&&r<17.5?.6+.4*sin(a*12+t*2):r<3?1:r<15.5&&abs(r*sin(3*a-t))<2.5?-.75:0',
    note: 'The only moving part. Everything else is arithmetic.',
  },
  {
    name: 'Portrait of the CPU',
    source:
      'hypot(abs(u)-7,v+4)<(fract(t/7)<.06?.5:2)?0:hypot(u,v-1)<1.5?-1:hypot(abs(u)-9,v-5)<6+sin(t)*2?1:hypot(abs(u)-12,v+12)<4?-.5:r<14?.5:0',
    note: 'CPU: 1 hamster. Cheeks at capacity. Blinks every 7 cycles.',
  },
  {
    name: 'Thermal Paste',
    source: '(sin(x/7+t/2)+sin(y/4-t/3)+sin((x+y)/9+t/5)+sin(r/3-t/2))/2',
    note: 'Apply a pea-sized amount to one hamster.',
  },
  {
    name: 'Power Nap',
    source: 'abs(r-8-5*sin(t/3))<1?-.8:max(0,(1+sin(t/3))*.6-r/14)',
    note: 'Not halted. Just resting his eyes.',
  },
  {
    name: 'Cardboard Tube',
    source: 'sin(60/r-t*1.5)*cos(3*a+t/2)*min(1,r/5)',
    note: 'Goes in one end. Nobody has reported back.',
  },
  {
    name: 'Seed Rain',
    source: 'x%2*-tan(1.7*fract(hash(x)*9+t*(.2+hash(x,1)/3)-y/30))/9',
    note: 'There is no spoon. There is a lot of millet.',
  },
  {
    name: 'Cheek Pouches',
    source: '6/hypot(u-19*sin(t/3),v-9*cos(t/4))+6/hypot(u+21*cos(t/5),v+9*sin(t/3))+6/hypot(u-9*sin(t/7),v+11*sin(t/4))-1',
    note: 'Three seeds merging the way snacks do.',
  },
  {
    name: 'Water Bottle',
    source: '(sin(hypot(u-14*cos(t/9),v)-t*1.5)+sin(hypot(u+14*cos(t/9),v)-t*1.5))/2',
    note: 'Two drips, one wave equation.',
  },
  {
    name: 'Square Wheel',
    source: 'sin(max(abs(u*cos(t/4)+v*sin(t/4)),abs(v*cos(t/4)-u*sin(t/4)))/1.5-t)',
    note: 'Rejected at design review. Shipped anyway.',
  },
  {
    name: 'Neon Treadmill',
    source: 'v>6?-(fract(9/(v-5)+t/2)<.25||fract(u/(v-5)/2)<.1)*(v-5)/8:hypot(u,v+4)<14&&sin(v-t/2)>-.5?.6-v/24:0',
    note: 'Forever running at a sunset he will never reach.',
  },
  {
    name: 'Cardio',
    source:
      'abs(r-16)<1.5?cos(a*12+t*2):hypot(u-10,v-2)<1?-1:hypot(u/1.6,v-6)<6||hypot(u-8,v-4)<4.5?.6:abs(v-13)<2&&abs(abs(u)-3-2*sin(t*6))<1?.9:0',
    note: 'He is running this. This is him running.',
  },
  {
    name: 'Double Helix',
    source: 'abs(v-13*sin(x/7+t))<2?1:abs(v+13*sin(x/7+t))<2?-1:x%4<1&&abs(v)<13*abs(sin(x/7+t))?.25:0',
    note: 'Hamster source code. Do not fork.',
  },
  {
    name: 'Spin Cycle',
    source: 'sin(a*2+sqrt(r)*4-t)*min(1,r/4)',
    note: 'Two arms, no brakes.',
  },
  {
    name: 'Inkblot Test',
    source: 'noise(abs(u)/9,v/9,t/7)*1.7',
    note: 'What do you see? Everyone says sunflower seeds.',
  },
  {
    name: 'Sunflower',
    source: 'sin(5*a+sqrt(r)*3-t)*sin(3*a-sqrt(r)*3+t/2)*min(1,r/5)',
    note: 'Five spirals one way, three the other. Fibonacci, but snackable.',
  },
  {
    name: 'Night Shift',
    source: 'hypot(u+18,v+8)<8&&hypot(u+15,v+10)>7?1:-sin(hash(x,y)*99+t*hash(y,x))**29*(hash(x,y)>.8)',
    note: 'Hamsters are nocturnal. So is this machine.',
  },
  {
    name: 'Munching Squares',
    source: 'sin((x^y)/5+t)',
    note: 'After the 1962 PDP-1 hack. Fourteen bytes of XOR.',
  },
  {
    name: 'Fresh Bedding',
    source: 'sin(x/3+sin(y/4+t)*2)*sin(y/3+cos(x/5-t)*2)',
    note: 'Wood shavings, lightly disturbed.',
  },
  {
    name: 'Bubble Wrap',
    source: 'sin((u*cos(t/6)+v*sin(t/6))/(3+sin(t/4)*1.5))*sin((v*cos(t/6)-u*sin(t/6))/(3+sin(t/4)*1.5))',
    note: 'Rotate, zoom, pop. A demoscene classic in soft plastic.',
  },
  {
    name: 'Cat Radar',
    source: 'r<17.5?fract((a-t/2)/6.283)**5*(hash(x>>2,y>>2)>.97?4:1)-(abs(r%6-3)<.5)/3:0',
    note: 'Scanning for predators. All clear, probably.',
  },
  {
    name: 'Sand Timer',
    source: 'abs(v)>16||abs(u)>abs(v)+1?0:v<0?(v>t*15/512-16?.9:-.2):abs(u)<1?(hash(y,floor(t*5))>.4)*.8:v>16-t*15/512?.9:-.2',
    note: 'Drains in exactly one slice. 512 cycles, then time is up.',
  },
  {
    name: 'Program Counter',
    source: 'v>12?(x/64<fract(t)?1:-.2):abs(v)<8&&x%8>1?(floor(t)>>(7-(x>>3))&1?1:-.25):0',
    note: 'One wheel pass, one increment. The bar is the cycle in progress.',
  },
  {
    name: 'Vital Signs',
    source: 'abs(v+7*sin(x/8-t/5)**99)<.7+7*sin(x/8-t/5)**99?1.2-fract(t/6-x/64):x%8<1&&y%6<1?-.5:0',
    note: 'Resting heart rate of a very small computer.',
  },
  {
    name: 'Hamster Drive',
    source: '(abs(fract(a*9)-.5)*r<6)*fract(hash(floor(a*9))+t/(2+hash(floor(a*9),1)*3)-sqrt(r)/4)**9*(floor(a*9)&1?2:-2)',
    note: 'Engage. Top speed about one metre per second.',
  },
  {
    name: 'Squeak EQ',
    source: 'x%4<3&&y>18+16*noise(floor(x/4),t/2,.5)?y>25?-1:1:0',
    note: 'Graphic equaliser for a very small soprano.',
  },
  {
    name: 'Table Tennis for One',
    source:
      'hypot(x-2-abs(t*9%120-60),y-2-abs(t*7%64-32))<2.2?1:(x<2|x>61)&&abs(y-2-abs(t*7%64-32))<6?-1:abs(u)<1&&y%4<2?-.4:0',
    note: 'Both paddles are the same hamster.',
  },
];

const HOUSE_ORDER = [
  'Flywheel',
  'Thermal Paste',
  'Cardio',
  'Water Bottle',
  'Seed Rain',
  'Portrait of the CPU',
  'Square Wheel',
  'Neon Treadmill',
  'Sand Timer',
  'Night Shift',
  'Spin Cycle',
  'Inkblot Test',
];

/**
 * The slice-to-program mapping is consensus between viewers: any reorder or edit changes
 * what every older deployment disagrees about, so treat this list as frozen once live.
 */
export const HOUSE_ROM: readonly Preset[] = PRESETS.filter((preset) => HOUSE_ORDER.includes(preset.name)).sort(
  (a, b) => HOUSE_ORDER.indexOf(a.name) - HOUSE_ORDER.indexOf(b.name),
);
