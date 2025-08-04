import * as admin from "firebase-admin";

// Inicializar apenas se não foi inicializado
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Interfaces para tipagem
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: admin.firestore.Timestamp;
  lastLogin: admin.firestore.Timestamp;
  plan: 'free' | 'pro' | 'enterprise';
  spreadsheetIds?: {
    financeiro?: string;
    operacoes?: string;
  };
  preferences?: {
    language?: string;
    timezone?: string;
    notifications?: boolean;
  };
  subscriptionId?: string;
  customerId?: string;
  updatedAt?: Date;
}

export interface Expense {
  id?: string;
  userId: string;
  date: string;
  type: string;
  value: number;
  supplier: string;
  description?: string; // Novo campo
  category?: string; // Novo campo
  createdAt: admin.firestore.Timestamp;
}

export interface Order {
  id?: string;
  userId: string;
  customer: string;
  products: string;
  deliveryDate: string;
  value: number;
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled';
  createdAt: admin.firestore.Timestamp;
}

export interface Recipe {
  id?: string;
  userId: string;
  name: string;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
  }>;
  createdAt: admin.firestore.Timestamp;
}

// Funções para gerenciar usuários
export const createUserProfile = async (userData: Partial<UserProfile>): Promise<void> => {
  const userRef = db.collection('users').doc(userData.uid!);
  
  await userRef.set({
    ...userData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    plan: 'free'
  });
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const doc = await db.collection('users').doc(uid).get();
  return doc.exists ? doc.data() as UserProfile : null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  await db.collection('users').doc(uid).update(data);
};

export const updateLastLogin = async (uid: string): Promise<void> => {
  await db.collection('users').doc(uid).update({
    lastLogin: admin.firestore.FieldValue.serverTimestamp()
  });
};

// Funções para gerenciar despesas
export const createExpense = async (expense: Omit<Expense, 'id' | 'createdAt'>): Promise<string> => {
  const expenseRef = await db.collection('users').doc(expense.userId).collection('expenses').add({
    ...expense,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return expenseRef.id;
};

export const updateExpense = async (userId: string, expenseId: string, data: Partial<Expense>): Promise<void> => {
  await db.collection('users').doc(userId).collection('expenses').doc(expenseId).update({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

export const deleteExpense = async (userId: string, expenseId: string): Promise<void> => {
  await db.collection('users').doc(userId).collection('expenses').doc(expenseId).delete();
};

export const getExpenses = async (userId: string, limit: number = 50): Promise<Expense[]> => {
  const snapshot = await db.collection('users').doc(userId).collection('expenses')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Expense));
};

export const getExpensesByMonth = async (userId: string, year: number, month: number): Promise<Expense[]> => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  const snapshot = await db.collection('users').doc(userId).collection('expenses')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endDate))
    .orderBy('createdAt', 'desc')
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Expense));
};

// Funções para gerenciar pedidos
export const createOrder = async (order: Omit<Order, 'id' | 'createdAt'>): Promise<string> => {
  const orderRef = await db.collection('users').doc(order.userId).collection('orders').add({
    ...order,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return orderRef.id;
};

export const getOrders = async (userId: string, limit: number = 50): Promise<Order[]> => {
  const snapshot = await db.collection('users').doc(userId).collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Order));
};

export const updateOrderStatus = async (userId: string, orderId: string, status: Order['status']): Promise<void> => {
  await db.collection('users').doc(userId).collection('orders').doc(orderId).update({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

// Funções para gerenciar receitas
export const createRecipe = async (recipe: Omit<Recipe, 'id' | 'createdAt'>): Promise<string> => {
  const recipeRef = await db.collection('users').doc(recipe.userId).collection('recipes').add({
    ...recipe,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return recipeRef.id;
};

export const getRecipes = async (userId: string): Promise<Recipe[]> => {
  const snapshot = await db.collection('users').doc(userId).collection('recipes')
    .orderBy('name', 'asc')
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Recipe));
};

export const getRecipe = async (userId: string, recipeId: string): Promise<Recipe | null> => {
  const doc = await db.collection('users').doc(userId).collection('recipes').doc(recipeId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } as Recipe : null;
};

// Funções para logs e analytics
export const logUserAction = async (userId: string, action: string, metadata: any): Promise<void> => {
  await db.collection('logs').doc(userId).collection('entries').add({
    action,
    metadata,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
};

// Função para migração de dados (se necessário)
export const migrateUserData = async (uid: string, legacyData: any): Promise<void> => {
  const batch = db.batch();
  
  // Migrar despesas
  if (legacyData.expenses) {
    legacyData.expenses.forEach((expense: any) => {
      const expenseRef = db.collection('users').doc(uid).collection('expenses').doc();
      batch.set(expenseRef, {
        ...expense,
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  }
  
  // Migrar pedidos
  if (legacyData.orders) {
    legacyData.orders.forEach((order: any) => {
      const orderRef = db.collection('users').doc(uid).collection('orders').doc();
      batch.set(orderRef, {
        ...order,
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  }
  
  await batch.commit();
};

// Função para verificar limites do plano
export const checkPlanLimits = async (userId: string, action: string): Promise<boolean> => {
  const user = await getUserProfile(userId);
  if (!user) return false;
  
  const limits = {
    free: { expenses: 100, orders: 50, recipes: 10 },
    pro: { expenses: 1000, orders: 500, recipes: 100 },
    enterprise: { expenses: -1, orders: -1, recipes: -1 } // ilimitado
  };
  
  const userLimits = limits[user.plan];
  
  switch (action) {
    case 'create_expense':
      if (userLimits.expenses === -1) return true;
      const expenseCount = await db.collection('users').doc(userId).collection('expenses').get();
      return expenseCount.size < userLimits.expenses;
      
    case 'create_order':
      if (userLimits.orders === -1) return true;
      const orderCount = await db.collection('users').doc(userId).collection('orders').get();
      return orderCount.size < userLimits.orders;
      
    case 'create_recipe':
      if (userLimits.recipes === -1) return true;
      const recipeCount = await db.collection('users').doc(userId).collection('recipes').get();
      return recipeCount.size < userLimits.recipes;
      
    default:
      return true;
  }
};

export interface InventoryItem {
  id?: string;
  userId: string;
  name: string;
  quantity: number;
  unit: string; // ex: 'kg', 'g', 'litros', 'ml', 'unidades'
  lowStockThreshold: number;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// Funções para gerenciar o estoque
export const addInventoryItem = async (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  const itemRef = await db.collection('users').doc(item.userId).collection('inventory').add({
    ...item,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return itemRef.id;
};

export const getInventory = async (userId: string): Promise<InventoryItem[]> => {
  const snapshot = await db.collection('users').doc(userId).collection('inventory')
    .orderBy('name', 'asc')
    .get();
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as InventoryItem));
};

export const updateInventoryItem = async (userId: string, itemId: string, data: Partial<InventoryItem>): Promise<void> => {
  await db.collection('users').doc(userId).collection('inventory').doc(itemId).update({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

export const deleteInventoryItem = async (userId: string, itemId: string): Promise<void> => {
  await db.collection('users').doc(userId).collection('inventory').doc(itemId).delete();
};

export const getLowStockItems = async (userId: string): Promise<InventoryItem[]> => {
    const snapshot = await db.collection('users').doc(userId).collection('inventory').get();
    
    const allItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    } as InventoryItem));

    return allItems.filter(item => item.quantity <= item.lowStockThreshold);
};

