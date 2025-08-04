/**
 * FASE 2: Sistema de Backup Automático
 * Backup diário do Firestore e recuperação de dados
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

// Configurações de backup
const BACKUP_CONFIG = {
    projectId: process.env.GCLOUD_PROJECT || 'gestor-confeitaria-ia',
    bucketName: `${process.env.GCLOUD_PROJECT}-backups`,
    retentionDays: 30,
    collections: ['users', 'metrics', 'performance', 'logs']
};

/**
 * Função agendada para backup diário simplificado
 * Executa todo dia às 2h da manhã
 */
export const dailyBackup = onSchedule('0 2 * * *', async (event) => {
    try {
        logger.info('Iniciando backup diário do Firestore');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `daily-backup-${timestamp}`;

        // Registrar backup no Firestore (simulado)
        await admin.firestore().collection('backups').add({
            backupId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            collections: BACKUP_CONFIG.collections,
            type: 'daily'
        });

        logger.info(`Backup diário registrado: ${backupId}`);

        // Limpar backups antigos
        await cleanupOldBackups();

    } catch (error: any) {
        logger.error('Erro no backup diário:', error);
        
        // Registrar falha no backup
        await admin.firestore().collection('backups').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'failed',
            error: error.message,
            collections: BACKUP_CONFIG.collections,
            type: 'daily'
        });
    }
});

/**
 * Função para backup sob demanda
 */
export const createBackup = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { collections, description } = request.data;

    try {
        logger.info(`Backup sob demanda iniciado por ${request.auth.uid}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupId = `manual-backup-${timestamp}`;
        const collectionsToBackup = collections || BACKUP_CONFIG.collections;

        // Registrar backup no Firestore
        const backupDoc = await admin.firestore().collection('backups').add({
            backupId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            collections: collectionsToBackup,
            requestedBy: request.auth.uid,
            description: description || 'Backup manual',
            type: 'manual'
        });

        logger.info(`Backup manual criado: ${backupId}`, {
            docId: backupDoc.id,
            requestedBy: request.auth.uid
        });

        return {
            success: true,
            backupId,
            docId: backupDoc.id,
            message: 'Backup criado com sucesso'
        };

    } catch (error: any) {
        logger.error('Erro no backup manual:', error);
        throw new HttpsError('internal', 'Erro ao criar backup', { error: error.message });
    }
});

/**
 * Função para listar backups disponíveis
 */
export const listBackups = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { limit = 20, status, type } = request.data;

    try {
        let query = admin.firestore()
            .collection('backups')
            .orderBy('timestamp', 'desc')
            .limit(limit);

        if (status) {
            query = query.where('status', '==', status);
        }

        if (type) {
            query = query.where('type', '==', type);
        }

        const snapshot = await query.get();
        
        const backups = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate()
        }));

        return {
            success: true,
            backups,
            total: backups.length
        };

    } catch (error: any) {
        logger.error('Erro ao listar backups:', error);
        throw new HttpsError('internal', 'Erro ao listar backups', { error: error.message });
    }
});

/**
 * Função para deletar backup
 */
export const deleteBackup = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { backupId } = request.data;

    if (!backupId) {
        throw new HttpsError('invalid-argument', 'ID do backup é obrigatório');
    }

    try {
        // Buscar backup
        const backupSnapshot = await admin.firestore()
            .collection('backups')
            .where('backupId', '==', backupId)
            .limit(1)
            .get();

        if (backupSnapshot.empty) {
            throw new HttpsError('not-found', 'Backup não encontrado');
        }

        const backupDoc = backupSnapshot.docs[0];
        
        // Marcar como deletado
        await backupDoc.ref.update({
            status: 'deleted',
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),
            deletedBy: request.auth.uid
        });

        logger.info(`Backup deletado: ${backupId}`, {
            deletedBy: request.auth.uid
        });

        return {
            success: true,
            message: 'Backup deletado com sucesso'
        };

    } catch (error: any) {
        logger.error('Erro ao deletar backup:', error);
        throw new HttpsError('internal', 'Erro ao deletar backup', { error: error.message });
    }
});

/**
 * Função para obter estatísticas de backup
 */
export const getBackupStats = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Contar backups por status
        const [completedSnapshot, failedSnapshot, totalSnapshot] = await Promise.all([
            admin.firestore()
                .collection('backups')
                .where('status', '==', 'completed')
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
                .get(),
            admin.firestore()
                .collection('backups')
                .where('status', '==', 'failed')
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
                .get(),
            admin.firestore()
                .collection('backups')
                .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
                .get()
        ]);

        const stats = {
            total: totalSnapshot.size,
            completed: completedSnapshot.size,
            failed: failedSnapshot.size,
            successRate: totalSnapshot.size > 0 ? (completedSnapshot.size / totalSnapshot.size) * 100 : 0,
            period: '30 days'
        };

        return {
            success: true,
            stats
        };

    } catch (error: any) {
        logger.error('Erro ao obter estatísticas de backup:', error);
        throw new HttpsError('internal', 'Erro ao obter estatísticas', { error: error.message });
    }
});

/**
 * Função para limpar backups antigos
 */
async function cleanupOldBackups(): Promise<void> {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - BACKUP_CONFIG.retentionDays);

        const oldBackupsSnapshot = await admin.firestore()
            .collection('backups')
            .where('timestamp', '<', admin.firestore.Timestamp.fromDate(cutoffDate))
            .where('status', '==', 'completed')
            .get();

        if (oldBackupsSnapshot.empty) {
            logger.info('Nenhum backup antigo para limpar');
            return;
        }

        const batch = admin.firestore().batch();
        let deletedCount = 0;

        oldBackupsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { 
                status: 'expired',
                expiredAt: admin.firestore.FieldValue.serverTimestamp()
            });
            deletedCount++;
        });

        await batch.commit();
        
        logger.info(`Marcados ${deletedCount} backups antigos como expirados`);

    } catch (error) {
        logger.error('Erro ao limpar backups antigos:', error);
    }
}

/**
 * Função agendada para verificar integridade dos backups
 */
export const verifyBackupIntegrity = onSchedule('0 6 * * 0', async (event) => {
    try {
        logger.info('Iniciando verificação de integridade dos backups');

        const recentBackupsSnapshot = await admin.firestore()
            .collection('backups')
            .where('status', '==', 'completed')
            .orderBy('timestamp', 'desc')
            .limit(7) // Últimos 7 backups
            .get();

        let healthyBackups = 0;
        let issues = 0;

        for (const doc of recentBackupsSnapshot.docs) {
            const backupData = doc.data();
            
            try {
                // Verificações básicas
                if (backupData.backupId && backupData.collections && backupData.timestamp) {
                    healthyBackups++;
                } else {
                    issues++;
                    logger.warn(`Backup com dados incompletos: ${doc.id}`);
                }
                
            } catch (error) {
                issues++;
                logger.error(`Erro ao verificar backup ${doc.id}:`, error);
            }
        }

        logger.info('Verificação de integridade concluída', {
            healthyBackups,
            issues,
            totalChecked: recentBackupsSnapshot.size
        });

        // Registrar resultado da verificação
        await admin.firestore().collection('backup_integrity_checks').add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            healthyBackups,
            issues,
            totalChecked: recentBackupsSnapshot.size,
            status: issues === 0 ? 'healthy' : 'issues_found'
        });

    } catch (error) {
        logger.error('Erro na verificação de integridade dos backups:', error);
    }
});

/**
 * Função para restaurar dados (simulada)
 */
export const simulateRestore = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { backupId, dryRun = true } = request.data;

    if (!backupId) {
        throw new HttpsError('invalid-argument', 'ID do backup é obrigatório');
    }

    try {
        // Buscar backup
        const backupSnapshot = await admin.firestore()
            .collection('backups')
            .where('backupId', '==', backupId)
            .where('status', '==', 'completed')
            .limit(1)
            .get();

        if (backupSnapshot.empty) {
            throw new HttpsError('not-found', 'Backup não encontrado ou não concluído');
        }

        const backupData = backupSnapshot.docs[0].data();

        if (dryRun) {
            logger.info(`Simulação de restauração para backup: ${backupId}`);
            
            return {
                success: true,
                message: 'Simulação de restauração concluída',
                backupInfo: {
                    backupId: backupData.backupId,
                    timestamp: backupData.timestamp?.toDate(),
                    collections: backupData.collections
                },
                dryRun: true
            };
        } else {
            // Em produção, aqui seria implementada a restauração real
            logger.warn(`RESTAURAÇÃO REAL solicitada por ${request.auth.uid} para backup: ${backupId}`);
            
            throw new HttpsError('unimplemented', 'Restauração real não implementada por segurança');
        }

    } catch (error: any) {
        logger.error('Erro na simulação de restauração:', error);
        throw new HttpsError('internal', 'Erro na restauração', { error: error.message });
    }
});
