/**
 * FASE 2.5: Sistema de Administrador
 * Controle total da plataforma para o super admin
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Configuração do super admin
export const ADMIN_CONFIG = {
    // IMPORTANTE: Substitua pelo seu UID real do Firebase Auth
    superAdminUID: "ADMIN_UID_PLACEHOLDER", // Será configurado após primeiro login
    adminEmails: ["seu-email@gmail.com"] // Substitua pelo seu email
};

// Verificar se usuário é admin
export const isAdmin = (uid: string): boolean => {
    return uid === ADMIN_CONFIG.superAdminUID;
};

// Verificar se email é admin
export const isAdminEmail = (email: string): boolean => {
    return ADMIN_CONFIG.adminEmails.includes(email);
};

// Configurar super admin (primeira vez)
export const setupSuperAdmin = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const userEmail = request.auth.token.email || '';
    
    // Verificar se é um email autorizado
    if (!isAdminEmail(userEmail)) {
        throw new HttpsError('permission-denied', 'Email não autorizado para admin');
    }

    try {
        // Configurar como super admin
        await admin.firestore().collection('admin_config').doc('super_admin').set({
            uid: request.auth.uid,
            email: userEmail,
            setupAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: true
        });

        // Atualizar configuração local (em produção, isso seria feito via variáveis de ambiente)
        ADMIN_CONFIG.superAdminUID = request.auth.uid;

        logger.info(`Super admin configurado: ${userEmail} (${request.auth.uid})`);

        return {
            success: true,
            message: 'Super admin configurado com sucesso!',
            adminUID: request.auth.uid
        };
    } catch (error: any) {
        logger.error('Erro ao configurar super admin:', error);
        throw new HttpsError('internal', 'Erro ao configurar admin', { error: error.message });
    }
});

// Dashboard administrativo
export const getAdminDashboard = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (!isAdmin(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Acesso negado - apenas administradores');
    }

    try {
        const db = admin.firestore();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Estatísticas gerais
        const [
            totalUsersSnapshot,
            recentUsersSnapshot,
            onboardingSessionsSnapshot,
            completedOnboardingSnapshot
        ] = await Promise.all([
            db.collection('users').get(),
            db.collection('users')
                .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(sevenDaysAgo))
                .get(),
            db.collection('onboarding_sessions').get(),
            db.collection('onboarding_sessions')
                .where('isCompleted', '==', true)
                .get()
        ]);

        // Métricas de atividade
        const metricsSnapshot = await db.collection('metrics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .get();

        // Análise de ações mais comuns
        const actionCounts: Record<string, number> = {};
        metricsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            actionCounts[data.action] = (actionCounts[data.action] || 0) + 1;
        });

        // Top 5 ações
        const topActions = Object.entries(actionCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([action, count]) => ({ action, count }));

        // Usuários mais ativos
        const userActivity: Record<string, number> = {};
        metricsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            userActivity[data.userId] = (userActivity[data.userId] || 0) + 1;
        });

        const topUsers = Object.entries(userActivity)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([userId, actions]) => ({ userId, actions }));

        // Taxa de conversão do onboarding
        const onboardingConversionRate = onboardingSessionsSnapshot.size > 0 
            ? (completedOnboardingSnapshot.size / onboardingSessionsSnapshot.size) * 100 
            : 0;

        const dashboard = {
            overview: {
                totalUsers: totalUsersSnapshot.size,
                newUsersLast7Days: recentUsersSnapshot.size,
                totalOnboardingSessions: onboardingSessionsSnapshot.size,
                completedOnboarding: completedOnboardingSnapshot.size,
                onboardingConversionRate: Math.round(onboardingConversionRate * 100) / 100
            },
            activity: {
                totalActionsLast30Days: metricsSnapshot.size,
                topActions,
                topUsers
            },
            systemHealth: {
                timestamp: now.toISOString(),
                status: 'healthy' // Pode ser expandido com verificações reais
            }
        };

        return {
            success: true,
            dashboard
        };
    } catch (error: any) {
        logger.error('Erro ao obter dashboard admin:', error);
        throw new HttpsError('internal', 'Erro ao obter dashboard', { error: error.message });
    }
});

// Listar todos os usuários (com paginação)
export const listAllUsers = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (!isAdmin(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Acesso negado - apenas administradores');
    }

    const { limit = 50, startAfter } = request.data;

    try {
        const db = admin.firestore();
        let query = db.collection('users')
            .orderBy('createdAt', 'desc')
            .limit(limit);

        if (startAfter) {
            const startAfterDoc = await db.collection('users').doc(startAfter).get();
            if (startAfterDoc.exists) {
                query = query.startAfter(startAfterDoc);
            }
        }

        const snapshot = await query.get();
        
        const users = await Promise.all(snapshot.docs.map(async (doc) => {
            const userData = doc.data();
            
            // Buscar sessão de onboarding
            const onboardingDoc = await db.collection('onboarding_sessions').doc(doc.id).get();
            const onboardingData = onboardingDoc.exists ? onboardingDoc.data() : null;

            // Contar atividades do usuário (últimos 30 dias)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const activitySnapshot = await db.collection('metrics')
                .where('userId', '==', doc.id)
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
                .get();

            return {
                uid: doc.id,
                ...userData,
                onboarding: onboardingData ? {
                    isCompleted: onboardingData.isCompleted,
                    currentStep: onboardingData.currentStep,
                    completedAt: onboardingData.completedAt?.toDate()
                } : null,
                activityLast30Days: activitySnapshot.size,
                createdAt: userData.createdAt?.toDate(),
                lastLogin: userData.lastLogin?.toDate()
            };
        }));

        return {
            success: true,
            users,
            hasMore: snapshot.size === limit
        };
    } catch (error: any) {
        logger.error('Erro ao listar usuários:', error);
        throw new HttpsError('internal', 'Erro ao listar usuários', { error: error.message });
    }
});

// Obter detalhes de um usuário específico
export const getUserDetails = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (!isAdmin(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Acesso negado - apenas administradores');
    }

    const { userId } = request.data;

    if (!userId) {
        throw new HttpsError('invalid-argument', 'ID do usuário é obrigatório');
    }

    try {
        const db = admin.firestore();

        // Dados do usuário
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'Usuário não encontrado');
        }

        const userData = userDoc.data();

        // Sessão de onboarding
        const onboardingDoc = await db.collection('onboarding_sessions').doc(userId).get();
        const onboardingData = onboardingDoc.exists ? onboardingDoc.data() : null;

        // Atividades recentes (últimos 30 dias)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const activitiesSnapshot = await db.collection('metrics')
            .where('userId', '==', userId)
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        const activities = activitiesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                action: data.action,
                success: data.success,
                duration: data.duration,
                timestamp: data.timestamp.toDate(),
                metadata: data.metadata
            };
        });

        // Estatísticas do usuário
        const stats = {
            totalActivities: activitiesSnapshot.size,
            successfulActivities: activities.filter(a => a.success).length,
            averageResponseTime: activities.length > 0 
                ? activities.reduce((sum, a) => sum + (a.duration || 0), 0) / activities.length 
                : 0
        };

        const userDetails = {
            uid: userId,
            ...userData,
            onboarding: onboardingData ? {
                isCompleted: onboardingData.isCompleted,
                currentStep: onboardingData.currentStep,
                startedAt: onboardingData.startedAt?.toDate(),
                completedAt: onboardingData.completedAt?.toDate(),
                collectedData: onboardingData.collectedData
            } : null,
            activities,
            stats,
            createdAt: userData?.createdAt?.toDate(),
            lastLogin: userData?.lastLogin?.toDate()
        };

        return {
            success: true,
            user: userDetails
        };
    } catch (error: any) {
        logger.error('Erro ao obter detalhes do usuário:', error);
        throw new HttpsError('internal', 'Erro ao obter detalhes', { error: error.message });
    }
});

// Atualizar plano de um usuário
export const updateUserPlan = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (!isAdmin(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Acesso negado - apenas administradores');
    }

    const { userId, plan, reason } = request.data;

    if (!userId || !plan) {
        throw new HttpsError('invalid-argument', 'ID do usuário e plano são obrigatórios');
    }

    const validPlans = ['free', 'pro', 'enterprise'];
    if (!validPlans.includes(plan)) {
        throw new HttpsError('invalid-argument', 'Plano inválido');
    }

    try {
        const db = admin.firestore();

        // Atualizar plano do usuário
        await db.collection('users').doc(userId).update({
            plan,
            planUpdatedBy: request.auth.uid,
            planUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            planUpdateReason: reason || 'Atualização administrativa'
        });

        // Log da ação
        await db.collection('admin_actions').add({
            adminId: request.auth.uid,
            action: 'update_user_plan',
            targetUserId: userId,
            details: { oldPlan: 'unknown', newPlan: plan, reason },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.info(`Plano do usuário ${userId} atualizado para ${plan} por admin ${request.auth.uid}`);

        return {
            success: true,
            message: `Plano atualizado para ${plan.toUpperCase()}`
        };
    } catch (error: any) {
        logger.error('Erro ao atualizar plano do usuário:', error);
        throw new HttpsError('internal', 'Erro ao atualizar plano', { error: error.message });
    }
});

// Obter logs de ações administrativas
export const getAdminLogs = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    if (!isAdmin(request.auth.uid)) {
        throw new HttpsError('permission-denied', 'Acesso negado - apenas administradores');
    }

    const { limit = 50 } = request.data;

    try {
        const db = admin.firestore();
        
        const logsSnapshot = await db.collection('admin_actions')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        const logs = logsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate()
        }));

        return {
            success: true,
            logs
        };
    } catch (error: any) {
        logger.error('Erro ao obter logs administrativos:', error);
        throw new HttpsError('internal', 'Erro ao obter logs', { error: error.message });
    }
});

// Verificar se usuário atual é admin
export const checkAdminStatus = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    try {
        const isUserAdmin = isAdmin(request.auth.uid);
        const userEmail = request.auth.token.email || '';
        const canBecomeAdmin = isAdminEmail(userEmail);

        return {
            success: true,
            isAdmin: isUserAdmin,
            canBecomeAdmin,
            uid: request.auth.uid,
            email: userEmail
        };
    } catch (error: any) {
        logger.error('Erro ao verificar status de admin:', error);
        throw new HttpsError('internal', 'Erro ao verificar status', { error: error.message });
    }
});
