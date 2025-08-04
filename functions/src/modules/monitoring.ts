/**
 * FASE 2: Sistema de Monitoramento Avançado
 * Métricas, logs estruturados e alertas para produção
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Interfaces para métricas
interface UserMetrics {
    userId: string;
    action: string;
    timestamp: Date;
    duration?: number;
    success: boolean;
    metadata?: any;
}

interface SystemMetrics {
    timestamp: Date;
    activeUsers: number;
    totalRequests: number;
    errorRate: number;
    avgResponseTime: number;
    cacheHitRate: number;
}

interface PerformanceMetric {
    functionName: string;
    duration: number;
    timestamp: Date;
    success: boolean;
    userId?: string;
}

// Classe para coleta de métricas
class MetricsCollector {
    private static db = admin.firestore();
    private static metricsBuffer: UserMetrics[] = [];
    private static performanceBuffer: PerformanceMetric[] = [];
    private static readonly BUFFER_SIZE = 100;

    // Registrar ação do usuário
    static async recordUserAction(
        userId: string,
        action: string,
        success: boolean = true,
        duration?: number,
        metadata?: any
    ): Promise<void> {
        const metric: UserMetrics = {
            userId,
            action,
            timestamp: new Date(),
            duration,
            success,
            metadata
        };

        this.metricsBuffer.push(metric);

        // Flush buffer se estiver cheio
        if (this.metricsBuffer.length >= this.BUFFER_SIZE) {
            await this.flushUserMetrics();
        }

        // Log estruturado
        logger.info('User Action', {
            userId,
            action,
            success,
            duration,
            timestamp: metric.timestamp.toISOString()
        });
    }

    // Registrar performance de função
    static async recordPerformance(
        functionName: string,
        duration: number,
        success: boolean,
        userId?: string
    ): Promise<void> {
        const metric: PerformanceMetric = {
            functionName,
            duration,
            timestamp: new Date(),
            success,
            userId
        };

        this.performanceBuffer.push(metric);

        // Flush buffer se estiver cheio
        if (this.performanceBuffer.length >= this.BUFFER_SIZE) {
            await this.flushPerformanceMetrics();
        }

        // Log de performance
        if (duration > 5000) { // Alertar se função demorar mais de 5s
            logger.warn('Slow Function', {
                functionName,
                duration,
                userId,
                timestamp: metric.timestamp.toISOString()
            });
        }
    }

    // Flush métricas de usuário para Firestore
    private static async flushUserMetrics(): Promise<void> {
        if (this.metricsBuffer.length === 0) return;

        try {
            const batch = this.db.batch();
            const metricsToFlush = [...this.metricsBuffer];
            this.metricsBuffer = [];

            metricsToFlush.forEach(metric => {
                const docRef = this.db.collection('metrics').doc();
                batch.set(docRef, {
                    ...metric,
                    timestamp: admin.firestore.Timestamp.fromDate(metric.timestamp)
                });
            });

            await batch.commit();
            logger.info(`Flushed ${metricsToFlush.length} user metrics`);
        } catch (error) {
            logger.error('Error flushing user metrics:', error);
            // Recolocar métricas no buffer em caso de erro
            this.metricsBuffer.unshift(...this.metricsBuffer);
        }
    }

    // Flush métricas de performance para Firestore
    private static async flushPerformanceMetrics(): Promise<void> {
        if (this.performanceBuffer.length === 0) return;

        try {
            const batch = this.db.batch();
            const metricsToFlush = [...this.performanceBuffer];
            this.performanceBuffer = [];

            metricsToFlush.forEach(metric => {
                const docRef = this.db.collection('performance').doc();
                batch.set(docRef, {
                    ...metric,
                    timestamp: admin.firestore.Timestamp.fromDate(metric.timestamp)
                });
            });

            await batch.commit();
            logger.info(`Flushed ${metricsToFlush.length} performance metrics`);
        } catch (error) {
            logger.error('Error flushing performance metrics:', error);
            // Recolocar métricas no buffer em caso de erro
            this.performanceBuffer.unshift(...this.performanceBuffer);
        }
    }

    // Forçar flush de todas as métricas
    static async flushAll(): Promise<void> {
        await Promise.all([
            this.flushUserMetrics(),
            this.flushPerformanceMetrics()
        ]);
    }
}

// Decorator para monitoramento automático de performance
export function MonitorPerformance(functionName?: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        const name = functionName || `${target.constructor.name}.${propertyName}`;

        descriptor.value = async function (...args: any[]) {
            const startTime = Date.now();
            let success = true;
            let userId: string | undefined;

            // Tentar extrair userId dos argumentos
            if (args.length > 0 && typeof args[0] === 'string') {
                userId = args[0];
            }

            try {
                const result = await method.apply(this, args);
                return result;
            } catch (error) {
                success = false;
                throw error;
            } finally {
                const duration = Date.now() - startTime;
                await MetricsCollector.recordPerformance(name, duration, success, userId);
            }
        };
    };
}

// Função para obter métricas do sistema
export const getSystemMetrics = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    // Esta função pode ser restrita a administradores
    // if (!isAdmin(request.auth.uid)) {
    //     throw new HttpsError('permission-denied', 'Acesso negado');
    // }

    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Buscar métricas das últimas 24 horas
        const metricsSnapshot = await admin.firestore()
            .collection('metrics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
            .get();

        const performanceSnapshot = await admin.firestore()
            .collection('performance')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(oneDayAgo))
            .get();

        // Calcular estatísticas
        const totalRequests = metricsSnapshot.size;
        const successfulRequests = metricsSnapshot.docs.filter(doc => doc.data().success).length;
        const errorRate = totalRequests > 0 ? ((totalRequests - successfulRequests) / totalRequests) * 100 : 0;

        const performanceData = performanceSnapshot.docs.map(doc => doc.data());
        const avgResponseTime = performanceData.length > 0 
            ? performanceData.reduce((sum, p) => sum + p.duration, 0) / performanceData.length 
            : 0;

        // Usuários únicos nas últimas 24h
        const uniqueUsers = new Set(metricsSnapshot.docs.map(doc => doc.data().userId)).size;

        const systemMetrics: SystemMetrics = {
            timestamp: now,
            activeUsers: uniqueUsers,
            totalRequests,
            errorRate,
            avgResponseTime,
            cacheHitRate: 0 // Implementar baseado no cache
        };

        return {
            success: true,
            metrics: systemMetrics,
            period: '24h'
        };

    } catch (error: any) {
        logger.error('Error getting system metrics:', error);
        throw new HttpsError('internal', 'Erro ao obter métricas', { error: error.message });
    }
});

// Função para obter métricas de um usuário específico
export const getUserMetrics = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const userId = request.auth.uid;
    const { days = 7 } = request.data;

    try {
        const now = new Date();
        const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        const metricsSnapshot = await admin.firestore()
            .collection('metrics')
            .where('userId', '==', userId)
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .orderBy('timestamp', 'desc')
            .limit(1000)
            .get();

        const metrics = metricsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                timestamp: data.timestamp.toDate()
            };
        });

        // Agrupar por ação
        const actionCounts = metrics.reduce((acc, metric: any) => {
            acc[metric.action] = (acc[metric.action] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Calcular estatísticas
        const totalActions = metrics.length;
        const successfulActions = metrics.filter((m: any) => m.success).length;
        const errorRate = totalActions > 0 ? ((totalActions - successfulActions) / totalActions) * 100 : 0;

        return {
            success: true,
            metrics: {
                totalActions,
                successfulActions,
                errorRate,
                actionCounts,
                recentActions: metrics.slice(0, 50) // Últimas 50 ações
            },
            period: `${days} days`
        };

    } catch (error: any) {
        logger.error(`Error getting user metrics for ${userId}:`, error);
        throw new HttpsError('internal', 'Erro ao obter métricas do usuário', { error: error.message });
    }
});

// Função agendada para limpeza de métricas antigas
export const cleanupOldMetrics = onSchedule({
    schedule: '0 2 * * *', // Todo dia às 2h
    region: 'southamerica-east1'
}, async (event) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const batch = admin.firestore().batch();
        let deletedCount = 0;

        // Limpar métricas de usuário antigas
        const oldMetricsSnapshot = await admin.firestore()
            .collection('metrics')
            .where('timestamp', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .limit(500)
            .get();

        oldMetricsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            deletedCount++;
        });

        // Limpar métricas de performance antigas
        const oldPerformanceSnapshot = await admin.firestore()
            .collection('performance')
            .where('timestamp', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .limit(500)
            .get();

        oldPerformanceSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            deletedCount++;
        });

        if (deletedCount > 0) {
            await batch.commit();
            logger.info(`Cleaned up ${deletedCount} old metrics`);
        }

        // Forçar flush das métricas pendentes
        await MetricsCollector.flushAll();

    } catch (error) {
        logger.error('Error cleaning up old metrics:', error);
    }
});

// Função para alertas de sistema
export const checkSystemHealth = onSchedule({
    schedule: '*/15 * * * *', // A cada 15 minutos
    region: 'southamerica-east1'
}, async (event) => {
    try {
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

        // Verificar taxa de erro
        const recentMetricsSnapshot = await admin.firestore()
            .collection('metrics')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(fifteenMinutesAgo))
            .get();

        if (recentMetricsSnapshot.size > 0) {
            const totalRequests = recentMetricsSnapshot.size;
            const failedRequests = recentMetricsSnapshot.docs.filter(doc => !doc.data().success).length;
            const errorRate = (failedRequests / totalRequests) * 100;

            // Alertar se taxa de erro > 10%
            if (errorRate > 10) {
                logger.error('High Error Rate Alert', {
                    errorRate,
                    totalRequests,
                    failedRequests,
                    period: '15 minutes'
                });
            }
        }

        // Verificar performance
        const recentPerformanceSnapshot = await admin.firestore()
            .collection('performance')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(fifteenMinutesAgo))
            .get();

        if (recentPerformanceSnapshot.size > 0) {
            const performanceData = recentPerformanceSnapshot.docs.map(doc => doc.data());
            const avgResponseTime = performanceData.reduce((sum, p) => sum + p.duration, 0) / performanceData.length;

            // Alertar se tempo médio > 3 segundos
            if (avgResponseTime > 3000) {
                logger.warn('High Response Time Alert', {
                    avgResponseTime,
                    sampleSize: performanceData.length,
                    period: '15 minutes'
                });
            }
        }

    } catch (error) {
        logger.error('Error checking system health:', error);
    }
});

// Exportar collector para uso em outros módulos
export { MetricsCollector };
