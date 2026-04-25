
export const COMMON_ITEMS_MAP: Record<string, { category: string, priorityLevel: string }> = {
  // Carnes y Pescados
  'pollo': { category: 'Carnes y Pescados', priorityLevel: 'high' },
  'carne': { category: 'Carnes y Pescados', priorityLevel: 'high' },
  'pescado': { category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'cerdo': { category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'jamon': { category: 'Carnes y Pescados', priorityLevel: 'medium' },
  'pechuga': { category: 'Carnes y Pescados', priorityLevel: 'high' },
  'hamburguesas': { category: 'Carnes y Pescados', priorityLevel: 'medium' },

  // Lácteos y Huevos
  'leche': { category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'huevos': { category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'queso': { category: 'Lácteos y Huevos', priorityLevel: 'high' },
  'yogur': { category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'mantequilla': { category: 'Lácteos y Huevos', priorityLevel: 'medium' },
  'crema': { category: 'Lácteos y Huevos', priorityLevel: 'medium' },

  // Frutas y Verduras
  'tomate': { category: 'Frutas y Verduras', priorityLevel: 'high' },
  'cebolla': { category: 'Frutas y Verduras', priorityLevel: 'high' },
  'papas': { category: 'Frutas y Verduras', priorityLevel: 'high' },
  'lechuga': { category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'manzana': { category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'platano': { category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'limon': { category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'zanahoria': { category: 'Frutas y Verduras', priorityLevel: 'medium' },
  'palta': { category: 'Frutas y Verduras', priorityLevel: 'medium' },

  // Despensa
  'arroz': { category: 'Despensa', priorityLevel: 'high' },
  'fideos': { category: 'Despensa', priorityLevel: 'high' },
  'pasta': { category: 'Despensa', priorityLevel: 'high' },
  'aceite': { category: 'Despensa', priorityLevel: 'high' },
  'sal': { category: 'Despensa', priorityLevel: 'medium' },
  'azucar': { category: 'Despensa', priorityLevel: 'medium' },
  'cafe': { category: 'Despensa', priorityLevel: 'high' },
  'te': { category: 'Despensa', priorityLevel: 'medium' },
  'mostaza': { category: 'Despensa', priorityLevel: 'low' },
  'ketchup': { category: 'Despensa', priorityLevel: 'low' },
  'mayonesa': { category: 'Despensa', priorityLevel: 'low' },
  'harina': { category: 'Despensa', priorityLevel: 'medium' },

  // Panadería
  'pan': { category: 'Panadería', priorityLevel: 'high' },
  'galletas': { category: 'Panadería', priorityLevel: 'medium' },
  'queque': { category: 'Panadería', priorityLevel: 'low' },

  // Higiene y Cuidado Personal
  'papel higienico': { category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'jabon': { category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },
  'shampoo': { category: 'Higiene y Cuidado Personal', priorityLevel: 'medium' },
  'pasta de dientes': { category: 'Higiene y Cuidado Personal', priorityLevel: 'high' },

  // Limpieza del Hogar
  'detergente': { category: 'Limpieza del Hogar', priorityLevel: 'high' },
  'cloro': { category: 'Limpieza del Hogar', priorityLevel: 'medium' },
  'lavaloza': { category: 'Limpieza del Hogar', priorityLevel: 'high' },
};

export function getInstantCategory(name: string): { category: string, priorityLevel: string } | null {
  const cleanName = name.toLowerCase()
    .trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar tildes
  
  if (COMMON_ITEMS_MAP[cleanName]) return COMMON_ITEMS_MAP[cleanName];
  
  // Búsqueda parcial simple
  for (const key in COMMON_ITEMS_MAP) {
    if (cleanName.includes(key) || key.includes(cleanName)) {
      return COMMON_ITEMS_MAP[key];
    }
  }
  
  return null;
}
