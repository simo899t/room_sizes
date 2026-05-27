// Furniture object catalogue
const OBJECTS = {
  bedroom: [
    { id: 'bed_single',  name: 'Single Bed',   icon: '🛏', w: 90,  d: 200, color: '#5c7a9e' },
    { id: 'bed_double',  name: 'Double Bed',   icon: '🛏', w: 140, d: 200, color: '#5c7a9e' },
    { id: 'bed_king',    name: 'King Bed',     icon: '🛏', w: 180, d: 200, color: '#5c7a9e' },
    { id: 'wardrobe',    name: 'Wardrobe',     icon: '🚪', w: 200, d: 60,  color: '#7a6050' },
    { id: 'dresser',     name: 'Dresser',      icon: '🗄', w: 100, d: 50,  color: '#8a7060' },
    { id: 'nightstand',  name: 'Nightstand',   icon: '📦', w: 50,  d: 45,  color: '#7a6050' },
    { id: 'desk',        name: 'Desk',         icon: '🖥', w: 120, d: 60,  color: '#4a7a8a' },
  ],
  living: [
    { id: 'sofa_2',      name: 'Sofa 2-seat',  icon: '🛋', w: 150, d: 85,  color: '#4a6080' },
    { id: 'sofa_3',      name: 'Sofa 3-seat',  icon: '🛋', w: 210, d: 85,  color: '#4a6080' },
    { id: 'sofa_l',      name: 'L-Sofa',       icon: '🛋', w: 250, d: 170, color: '#4a6080' },
    { id: 'armchair',    name: 'Armchair',     icon: '💺', w: 90,  d: 85,  color: '#4a6080' },
    { id: 'coffee_tbl',  name: 'Coffee Table', icon: '⬜', w: 100, d: 60,  color: '#3a5060' },
    { id: 'tv_unit',     name: 'TV Unit',      icon: '📺', w: 180, d: 45,  color: '#2a4050' },
    { id: 'bookshelf',   name: 'Bookshelf',    icon: '📚', w: 80,  d: 30,  color: '#5a4030' },
    { id: 'dining_tbl',  name: 'Dining Table', icon: '🍽', w: 160, d: 90,  color: '#5a4535' },
    { id: 'chair',       name: 'Chair',        icon: '🪑', w: 45,  d: 45,  color: '#4a4535' },
  ],
  kitchen: [
    { id: 'fridge',      name: 'Fridge',       icon: '🧊', w: 60,  d: 65,  color: '#3a6080' },
    { id: 'stove',       name: 'Stove/Oven',   icon: '🔥', w: 60,  d: 60,  color: '#504030' },
    { id: 'sink_k',      name: 'Kitchen Sink', icon: '🚿', w: 80,  d: 55,  color: '#3a6080' },
    { id: 'counter',     name: 'Counter',      icon: '⬛', w: 120, d: 60,  color: '#3a5055' },
    { id: 'island',      name: 'Kitchen Island', icon: '⬛', w: 120, d: 80, color: '#2a4045' },
    { id: 'dishwasher',  name: 'Dishwasher',   icon: '🍽', w: 60,  d: 60,  color: '#3a5060' },
  ],
  bathroom: [
    { id: 'toilet',      name: 'Toilet',       icon: '🚽', w: 40,  d: 65,  color: '#3a6070' },
    { id: 'shower',      name: 'Shower',       icon: '🚿', w: 90,  d: 90,  color: '#2a5070' },
    { id: 'bathtub',     name: 'Bathtub',      icon: '🛁', w: 80,  d: 170, color: '#2a5070' },
    { id: 'sink_b',      name: 'Sink',         icon: '🚿', w: 55,  d: 45,  color: '#3a6070' },
    { id: 'vanity',      name: 'Vanity',       icon: '🪞', w: 90,  d: 50,  color: '#3a5060' },
  ],
};
