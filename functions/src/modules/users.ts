/**
 * FASE 2: Módulo de Gerenciamento de Usuários
 * Funções otimizadas para escalabilidade
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
    createUserProfile,
    getUserProfile,
    updateUserProfile,
    updateLastLogin,
    logUserAction
} from "../database";

// Cache em memória para perfis de usuário (otimização)
const userProfileCache = new Map<string, { profile: any, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Função otimizada para obter perfil do usuário com cache
 */
export const getUserProfileOptimized = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;
    const now = Date.now();

    try {
        // Verificar cache primeiro
        const cached = userProfileCache.get(uid);
        if (cached && (now - cached.timestamp) < CACHE_TTL) {
            logger.info(`Cache hit para usuário ${uid}`);
            await logUserAction(uid, 'get_profile_cached', { source: 'cache' });
            return { success: true, profile: cached.profile, source: 'cache' };
        }

        // Buscar do Firestore se não estiver em cache
        const profile = await getUserProfile(uid);
        
        if (profile) {
            // Atualizar cache
            userProfileCache.set(uid, { profile, timestamp: now });
            
            // Limpar cache antigo (garbage collection simples)
            if (userProfileCache.size > 1000) {
                const oldestEntries = Array.from(userProfileCache.entries())
                    .sort(([,a], [,b]) => a.timestamp - b.timestamp)
                    .slice(0, 100);
                
                oldestEntries.forEach(([key]) => userProfileCache.delete(key));
            }

            await logUserAction(uid, 'get_profile_db', { source: 'firestore' });
            return { success: true, profile, source: 'firestore' };
        }

        return { success: false, message: 'Perfil não encontrado' };

    } catch (error: any) {
        logger.error(`Erro ao obter perfil do usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro interno do servidor', { error: error.message });
    }
});

/**
 * Função para criar/atualizar perfil de usuário
 */
export const setupUserProfile = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;
    const { email, displayName, photoURL, preferences } = request.data;

    try {
        // Verificar se usuário já existe
        let existingProfile = await getUserProfile(uid);
        
        if (!existingProfile) {
            // Criar novo perfil
            await createUserProfile({
                uid,
                email: email || request.auth.token.email || '',
                displayName: displayName || request.auth.token.name || '',
                photoURL: photoURL || request.auth.token.picture || '',
                plan: 'free',
                preferences: preferences || {
                    language: 'pt-BR',
                    timezone: 'America/Sao_Paulo',
                    notifications: true
                }
            });

            await logUserAction(uid, 'profile_created', { email, displayName });
            logger.info(`Novo perfil criado para usuário ${uid}`);
        } else {
            // Atualizar perfil existente
            const updateData: any = {};
            if (displayName) updateData.displayName = displayName;
            if (photoURL) updateData.photoURL = photoURL;
            if (preferences) updateData.preferences = { ...existingProfile.preferences, ...preferences };

            if (Object.keys(updateData).length > 0) {
                await updateUserProfile(uid, updateData);
                await logUserAction(uid, 'profile_updated', updateData);
            }
        }

        // Atualizar último login
        await updateLastLogin(uid);

        // Invalidar cache
        userProfileCache.delete(uid);

        // Buscar perfil atualizado
        const updatedProfile = await getUserProfile(uid);

        return {
            success: true,
            message: existingProfile ? 'Perfil atualizado com sucesso' : 'Perfil criado com sucesso',
            profile: updatedProfile
        };

    } catch (error: any) {
        logger.error(`Erro ao configurar perfil do usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro ao configurar perfil', { error: error.message });
    }
});

/**
 * Função para atualizar plano do usuário
 */
export const updateUserPlan = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;
    const { plan, subscriptionId, customerId } = request.data;

    // Validar plano
    const validPlans = ['free', 'pro', 'enterprise'];
    if (!validPlans.includes(plan)) {
        throw new HttpsError('invalid-argument', 'Plano inválido');
    }

    try {
        const updateData: any = {
            plan,
            updatedAt: new Date()
        };

        if (subscriptionId) updateData.subscriptionId = subscriptionId;
        if (customerId) updateData.customerId = customerId;

        await updateUserProfile(uid, updateData);
        await logUserAction(uid, 'plan_updated', { plan, subscriptionId });

        // Invalidar cache
        userProfileCache.delete(uid);

        logger.info(`Plano atualizado para ${plan} - usuário ${uid}`);

        return {
            success: true,
            message: `Plano atualizado para ${plan.toUpperCase()}`,
            plan
        };

    } catch (error: any) {
        logger.error(`Erro ao atualizar plano do usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro ao atualizar plano', { error: error.message });
    }
});

/**
 * Função para obter estatísticas do usuário
 */
export const getUserStats = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const uid = request.auth.uid;

    try {
        const profile = await getUserProfile(uid);
        if (!profile) {
            throw new HttpsError('not-found', 'Perfil não encontrado');
        }

        // Buscar estatísticas básicas (implementar conforme necessário)
        const stats = {
            plan: profile.plan,
            memberSince: profile.createdAt,
            lastLogin: profile.lastLogin,
            // Adicionar mais estatísticas conforme necessário
        };

        await logUserAction(uid, 'stats_viewed', {});

        return {
            success: true,
            stats
        };

    } catch (error: any) {
        logger.error(`Erro ao obter estatísticas do usuário ${uid}:`, error);
        throw new HttpsError('internal', 'Erro ao obter estatísticas', { error: error.message });
    }
});

/**
 * Função para limpar cache (administrativa)
 */
export const clearUserCache = onCall({ region: 'southamerica-east1' }, async (request) => {
    // Esta função pode ser restrita a administradores
    const { userId } = request.data;

    if (userId) {
        userProfileCache.delete(userId);
        logger.info(`Cache limpo para usuário ${userId}`);
    } else {
        userProfileCache.clear();
        logger.info('Cache de usuários completamente limpo');
    }

    return {
        success: true,
        message: 'Cache limpo com sucesso'
    };
});
