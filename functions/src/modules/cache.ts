/**
 * FASE 2: Sistema de Cache Avançado
 * Implementação de cache em memória e Redis para escalabilidade
 */

import * as logger from "firebase-functions/logger";

// Interface para itens do cache
interface CacheItem<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

// Cache em memória (para desenvolvimento e fallback)
class MemoryCache {
    private cache = new Map<string, CacheItem<any>>();
    private maxSize: number;

    constructor(maxSize: number = 1000) {
        this.maxSize = maxSize;
    }

    set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
        // Limpar cache se estiver muito grande
        if (this.cache.size >= this.maxSize) {
            this.cleanup();
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlMs
        });

        logger.debug(`Cache set: ${key} (TTL: ${ttlMs}ms)`);
    }

    get<T>(key: string): T | null {
        const item = this.cache.get(key);
        
        if (!item) {
            logger.debug(`Cache miss: ${key}`);
            return null;
        }

        const now = Date.now();
        if (now - item.timestamp > item.ttl) {
            this.cache.delete(key);
            logger.debug(`Cache expired: ${key}`);
            return null;
        }

        logger.debug(`Cache hit: ${key}`);
        return item.data as T;
    }

    delete(key: string): boolean {
        const deleted = this.cache.delete(key);
        if (deleted) {
            logger.debug(`Cache deleted: ${key}`);
        }
        return deleted;
    }

    clear(): void {
        this.cache.clear();
        logger.info('Memory cache cleared');
    }

    private cleanup(): void {
        const now = Date.now();
        const entries = Array.from(this.cache.entries());
        
        // Remover itens expirados
        const expiredKeys = entries
            .filter(([, item]) => now - item.timestamp > item.ttl)
            .map(([key]) => key);
        
        expiredKeys.forEach(key => this.cache.delete(key));

        // Se ainda estiver cheio, remover os mais antigos
        if (this.cache.size >= this.maxSize) {
            const sortedEntries = entries
                .filter(([key]) => !expiredKeys.includes(key))
                .sort(([, a], [, b]) => a.timestamp - b.timestamp);
            
            const toRemove = sortedEntries.slice(0, Math.floor(this.maxSize * 0.2));
            toRemove.forEach(([key]) => this.cache.delete(key));
        }

        logger.info(`Cache cleanup: removed ${expiredKeys.length} expired items`);
    }

    getStats(): { size: number; maxSize: number } {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

// Instância global do cache em memória
const memoryCache = new MemoryCache(1000);

// Cache distribuído (Redis) - para produção
class RedisCache {
    private isAvailable: boolean = false;
    private client: any = null;

    constructor() {
        this.initializeRedis();
    }

    private async initializeRedis(): Promise<void> {
        try {
            // Em produção, você configuraria Redis aqui
            // const redis = require('redis');
            // this.client = redis.createClient({
            //     url: process.env.REDIS_URL
            // });
            // await this.client.connect();
            // this.isAvailable = true;
            
            logger.info('Redis cache não configurado - usando cache em memória');
        } catch (error) {
            logger.warn('Redis não disponível, usando cache em memória', error);
            this.isAvailable = false;
        }
    }

    async set<T>(key: string, data: T, ttlSeconds: number = 300): Promise<void> {
        if (!this.isAvailable) {
            return memoryCache.set(key, data, ttlSeconds * 1000);
        }

        try {
            await this.client.setEx(key, ttlSeconds, JSON.stringify(data));
            logger.debug(`Redis set: ${key} (TTL: ${ttlSeconds}s)`);
        } catch (error) {
            logger.error('Redis set error:', error);
            // Fallback para cache em memória
            memoryCache.set(key, data, ttlSeconds * 1000);
        }
    }

    async get<T>(key: string): Promise<T | null> {
        if (!this.isAvailable) {
            return memoryCache.get<T>(key);
        }

        try {
            const data = await this.client.get(key);
            if (data) {
                logger.debug(`Redis hit: ${key}`);
                return JSON.parse(data) as T;
            }
            logger.debug(`Redis miss: ${key}`);
            return null;
        } catch (error) {
            logger.error('Redis get error:', error);
            // Fallback para cache em memória
            return memoryCache.get<T>(key);
        }
    }

    async delete(key: string): Promise<boolean> {
        if (!this.isAvailable) {
            return memoryCache.delete(key);
        }

        try {
            const result = await this.client.del(key);
            logger.debug(`Redis deleted: ${key}`);
            return result > 0;
        } catch (error) {
            logger.error('Redis delete error:', error);
            return memoryCache.delete(key);
        }
    }

    async clear(): Promise<void> {
        if (!this.isAvailable) {
            return memoryCache.clear();
        }

        try {
            await this.client.flushAll();
            logger.info('Redis cache cleared');
        } catch (error) {
            logger.error('Redis clear error:', error);
            memoryCache.clear();
        }
    }
}

// Instância global do cache distribuído
const distributedCache = new RedisCache();

// Interface unificada de cache
export class CacheManager {
    // Cache para perfis de usuário
    static async getUserProfile(uid: string): Promise<any | null> {
        const key = `user_profile:${uid}`;
        return await distributedCache.get(key);
    }

    static async setUserProfile(uid: string, profile: any, ttlSeconds: number = 300): Promise<void> {
        const key = `user_profile:${uid}`;
        await distributedCache.set(key, profile, ttlSeconds);
    }

    static async deleteUserProfile(uid: string): Promise<boolean> {
        const key = `user_profile:${uid}`;
        return await distributedCache.delete(key);
    }

    // Cache para dados financeiros
    static async getExpenses(uid: string): Promise<any[] | null> {
        const key = `expenses:${uid}`;
        return await distributedCache.get(key);
    }

    static async setExpenses(uid: string, expenses: any[], ttlSeconds: number = 180): Promise<void> {
        const key = `expenses:${uid}`;
        await distributedCache.set(key, expenses, ttlSeconds);
    }

    static async deleteExpenses(uid: string): Promise<boolean> {
        const key = `expenses:${uid}`;
        return await distributedCache.delete(key);
    }

    // Cache para pedidos
    static async getOrders(uid: string): Promise<any[] | null> {
        const key = `orders:${uid}`;
        return await distributedCache.get(key);
    }

    static async setOrders(uid: string, orders: any[], ttlSeconds: number = 180): Promise<void> {
        const key = `orders:${uid}`;
        await distributedCache.set(key, orders, ttlSeconds);
    }

    static async deleteOrders(uid: string): Promise<boolean> {
        const key = `orders:${uid}`;
        return await distributedCache.delete(key);
    }

    // Cache para receitas
    static async getRecipes(uid: string): Promise<any[] | null> {
        const key = `recipes:${uid}`;
        return await distributedCache.get(key);
    }

    static async setRecipes(uid: string, recipes: any[], ttlSeconds: number = 600): Promise<void> {
        const key = `recipes:${uid}`;
        await distributedCache.set(key, recipes, ttlSeconds);
    }

    static async deleteRecipes(uid: string): Promise<boolean> {
        const key = `recipes:${uid}`;
        return await distributedCache.delete(key);
    }

    // Cache para análises de IA
    static async getAnalysis(uid: string, query: string): Promise<any | null> {
        const key = `analysis:${uid}:${Buffer.from(query).toString('base64')}`;
        return await distributedCache.get(key);
    }

    static async setAnalysis(uid: string, query: string, analysis: any, ttlSeconds: number = 3600): Promise<void> {
        const key = `analysis:${uid}:${Buffer.from(query).toString('base64')}`;
        await distributedCache.set(key, analysis, ttlSeconds);
    }

    // Invalidar todos os caches de um usuário
    static async invalidateUserCache(uid: string): Promise<void> {
        await Promise.all([
            this.deleteUserProfile(uid),
            this.deleteExpenses(uid),
            this.deleteOrders(uid),
            this.deleteRecipes(uid)
        ]);
        logger.info(`Cache invalidado para usuário ${uid}`);
    }

    // Estatísticas do cache
    static getCacheStats(): any {
        return {
            memory: memoryCache.getStats(),
            redis: 'not_configured' // Será 'connected' quando Redis estiver configurado
        };
    }

    // Limpar todo o cache
    static async clearAllCache(): Promise<void> {
        await distributedCache.clear();
        logger.info('Todo o cache foi limpo');
    }
}

// Middleware para cache automático
export const withCache = <T>(
    cacheKey: (uid: string, ...args: any[]) => string,
    ttlSeconds: number = 300
) => {
    return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
        const method = descriptor.value;

        descriptor.value = async function(uid: string, ...args: any[]): Promise<T> {
            const key = cacheKey(uid, ...args);
            
            // Tentar buscar do cache primeiro
            const cached = await distributedCache.get<T>(key);
            if (cached !== null) {
                logger.debug(`Cache hit para ${propertyName}: ${key}`);
                return cached;
            }

            // Executar método original
            const result = await method.apply(this, [uid, ...args]);
            
            // Salvar no cache
            if (result !== null && result !== undefined) {
                await distributedCache.set(key, result, ttlSeconds);
                logger.debug(`Cache set para ${propertyName}: ${key}`);
            }

            return result;
        };
    };
};

export { memoryCache, distributedCache };
