/**
 * FASE 2.5: Agente de Onboarding Inteligente
 * Conversa humana, simpática e baseada na planilha de controle financeiro
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { createUserProfile } from "../database";

// Estados do onboarding baseados na planilha financeira
export enum OnboardingStep {
    WELCOME = 'welcome',
    NAME = 'name',
    BUSINESS_NAME = 'business_name',
    GOALS = 'goals',
    FIXED_COSTS_RENT = 'fixed_costs_rent',
    FIXED_COSTS_UTILITIES = 'fixed_costs_utilities',
    FIXED_COSTS_INTERNET = 'fixed_costs_internet',
    FIXED_COSTS_SALARY = 'fixed_costs_salary',
    FIXED_COSTS_OTHER = 'fixed_costs_other',
    VARIABLE_COSTS_INGREDIENTS = 'variable_costs_ingredients',
    VARIABLE_COSTS_PACKAGING = 'variable_costs_packaging',
    PRICING_STRATEGY = 'pricing_strategy',
    MONTHLY_GOAL = 'monthly_goal',
    COMPLETION = 'completion'
}

// Interface para sessão de onboarding
export interface OnboardingSession {
    userId: string;
    currentStep: OnboardingStep;
    collectedData: Record<string, any>;
    startedAt: admin.firestore.Timestamp;
    lastInteraction: admin.firestore.Timestamp;
    isCompleted: boolean;
}

// Interface para mensagens
interface OnboardingMessage {
    message: string;
    options?: string[];
    placeholder?: string;
    hint?: string;
}

// Mensagens humanizadas baseadas na planilha
const ONBOARDING_MESSAGES: Record<OnboardingStep, OnboardingMessage> = {
    [OnboardingStep.WELCOME]: {
        message: "Olá! 😊 Que bom ter você aqui! Vou te ajudar a organizar as finanças da sua confeitaria de forma simples e eficiente. Vamos começar?",
        options: ["Sim, vamos começar! 🚀", "Tenho algumas dúvidas primeiro 🤔"]
    },
    [OnboardingStep.NAME]: {
        message: "Perfeito! Como você gostaria de ser chamado(a)? Pode ser seu nome, apelido, como preferir! 😄",
        placeholder: "Digite seu nome..."
    },
    [OnboardingStep.BUSINESS_NAME]: {
        message: "Prazer em conhecer você, {name}! ✨ Agora me conta, qual é o nome da sua confeitaria?",
        placeholder: "Nome da sua confeitaria..."
    },
    [OnboardingStep.GOALS]: {
        message: "Que nome lindo, {businessName}! 🍰 Me conta, qual é seu principal objetivo agora?",
        options: [
            "Controlar melhor os custos 💰",
            "Organizar pedidos e agenda 📅", 
            "Aumentar o lucro 📈",
            "Precificar produtos corretamente 🏷️",
            "Ter controle completo do negócio 🎯"
        ]
    },
    [OnboardingStep.FIXED_COSTS_RENT]: {
        message: "Excelente meta! 🎯 Vamos organizar seus custos fixos primeiro. Quanto você paga mensalmente de aluguel? (Se não paga, pode colocar 0)",
        placeholder: "Ex: 1200",
        hint: "💡 Custos fixos são aqueles que você paga todo mês, independente das vendas"
    },
    [OnboardingStep.FIXED_COSTS_UTILITIES]: {
        message: "Perfeito! E quanto gasta por mês com água, luz e gás? 💡",
        placeholder: "Ex: 300",
        hint: "Pode ser uma média dos últimos meses"
    },
    [OnboardingStep.FIXED_COSTS_INTERNET]: {
        message: "Ótimo! Quanto paga de internet e telefone por mês? 📱",
        placeholder: "Ex: 150"
    },
    [OnboardingStep.FIXED_COSTS_SALARY]: {
        message: "E se você paga algum funcionário ou tem pró-labore, quanto é por mês? (Se não tem, coloque 0) 👥",
        placeholder: "Ex: 2000"
    },
    [OnboardingStep.FIXED_COSTS_OTHER]: {
        message: "Tem mais algum custo fixo? Como seguro, contador, licenças? 📋",
        placeholder: "Ex: 200",
        hint: "Se não tem outros custos, pode colocar 0"
    },
    [OnboardingStep.VARIABLE_COSTS_INGREDIENTS]: {
        message: "Agora vamos aos custos variáveis! 📊 Quanto você gasta em média por mês com ingredientes?",
        placeholder: "Ex: 800",
        hint: "💡 Custos variáveis mudam conforme sua produção"
    },
    [OnboardingStep.VARIABLE_COSTS_PACKAGING]: {
        message: "E com embalagens, caixas, sacolas por mês? 📦",
        placeholder: "Ex: 200"
    },
    [OnboardingStep.PRICING_STRATEGY]: {
        message: "Quase terminando! 🎉 Como você define o preço dos seus produtos hoje?",
        options: [
            "Custo + margem fixa (ex: custo + 50%) 📊",
            "Preço da concorrência 👀",
            "Feeling/experiência 💭",
            "Ainda não tenho método definido 🤷‍♀️"
        ]
    },
    [OnboardingStep.MONTHLY_GOAL]: {
        message: "Última pergunta! 🏁 Qual sua meta de faturamento mensal?",
        placeholder: "Ex: 5000",
        hint: "Pode ser uma meta realista que você gostaria de alcançar"
    },
    [OnboardingStep.COMPLETION]: {
        message: "Pronto, {name}! 🎉 Sua confeitaria {businessName} está configurada! Agora você tem controle total das suas finanças. Vamos começar a usar? ✨"
    }
};

// Classe principal do agente de onboarding
export class OnboardingAgent {
    private static db = admin.firestore();

    // Iniciar onboarding
    static async startOnboarding(userId: string): Promise<OnboardingSession> {
        const session: OnboardingSession = {
            userId,
            currentStep: OnboardingStep.WELCOME,
            collectedData: {},
            startedAt: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
            lastInteraction: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
            isCompleted: false
        };

        await this.db.collection('onboarding_sessions').doc(userId).set(session);
        
        return session;
    }

    // Obter sessão atual
    static async getSession(userId: string): Promise<OnboardingSession | null> {
        const doc = await this.db.collection('onboarding_sessions').doc(userId).get();
        return doc.exists ? doc.data() as OnboardingSession : null;
    }

    // Processar resposta do usuário
    static async processResponse(userId: string, response: string): Promise<{
        message: string;
        options?: string[];
        placeholder?: string;
        hint?: string;
        isCompleted: boolean;
        nextStep?: OnboardingStep;
    }> {
        const session = await this.getSession(userId);
        if (!session) {
            throw new Error('Sessão de onboarding não encontrada');
        }

        // Salvar resposta atual
        session.collectedData[session.currentStep] = response.trim();
        
        // Determinar próximo passo
        const nextStep = this.getNextStep(session.currentStep);
        
        if (nextStep === OnboardingStep.COMPLETION) {
            // Finalizar onboarding e criar perfil do usuário
            await this.completeOnboarding(session);
            
            const completionMessage = this.formatMessage(
                ONBOARDING_MESSAGES[OnboardingStep.COMPLETION].message,
                session.collectedData
            );
            
            return {
                message: completionMessage,
                isCompleted: true
            };
        }

        // Atualizar sessão
        session.currentStep = nextStep;
        session.lastInteraction = admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp;
        
        await this.db.collection('onboarding_sessions').doc(userId).update({
            currentStep: nextStep,
            collectedData: session.collectedData,
            lastInteraction: session.lastInteraction
        });

        // Obter próxima mensagem
        const nextMessage = ONBOARDING_MESSAGES[nextStep];
        const formattedMessage = this.formatMessage(nextMessage.message, session.collectedData);

        return {
            message: formattedMessage,
            options: nextMessage.options,
            placeholder: nextMessage.placeholder,
            hint: nextMessage.hint,
            isCompleted: false,
            nextStep
        };
    }

    // Obter mensagem inicial
    static getWelcomeMessage(): {
        message: string;
        options?: string[];
        placeholder?: string;
        hint?: string;
    } {
        const welcome = ONBOARDING_MESSAGES[OnboardingStep.WELCOME];
        return {
            message: welcome.message,
            options: welcome.options,
            placeholder: welcome.placeholder,
            hint: welcome.hint
        };
    }

    // Determinar próximo passo
    private static getNextStep(currentStep: OnboardingStep): OnboardingStep {
        const stepOrder = [
            OnboardingStep.WELCOME,
            OnboardingStep.NAME,
            OnboardingStep.BUSINESS_NAME,
            OnboardingStep.GOALS,
            OnboardingStep.FIXED_COSTS_RENT,
            OnboardingStep.FIXED_COSTS_UTILITIES,
            OnboardingStep.FIXED_COSTS_INTERNET,
            OnboardingStep.FIXED_COSTS_SALARY,
            OnboardingStep.FIXED_COSTS_OTHER,
            OnboardingStep.VARIABLE_COSTS_INGREDIENTS,
            OnboardingStep.VARIABLE_COSTS_PACKAGING,
            OnboardingStep.PRICING_STRATEGY,
            OnboardingStep.MONTHLY_GOAL,
            OnboardingStep.COMPLETION
        ];

        const currentIndex = stepOrder.indexOf(currentStep);
        return stepOrder[currentIndex + 1] || OnboardingStep.COMPLETION;
    }

    // Formatar mensagem com dados coletados
    private static formatMessage(message: string, data: Record<string, any>): string {
        return message
            .replace('{name}', data[OnboardingStep.NAME] || '')
            .replace('{businessName}', data[OnboardingStep.BUSINESS_NAME] || '');
    }

    // Finalizar onboarding e criar perfil
    private static async completeOnboarding(session: OnboardingSession): Promise<void> {
        const data = session.collectedData;
        
        // Calcular custos totais
        const fixedCosts = {
            rent: parseFloat(data[OnboardingStep.FIXED_COSTS_RENT]) || 0,
            utilities: parseFloat(data[OnboardingStep.FIXED_COSTS_UTILITIES]) || 0,
            internet: parseFloat(data[OnboardingStep.FIXED_COSTS_INTERNET]) || 0,
            salary: parseFloat(data[OnboardingStep.FIXED_COSTS_SALARY]) || 0,
            other: parseFloat(data[OnboardingStep.FIXED_COSTS_OTHER]) || 0
        };

        const variableCosts = {
            ingredients: parseFloat(data[OnboardingStep.VARIABLE_COSTS_INGREDIENTS]) || 0,
            packaging: parseFloat(data[OnboardingStep.VARIABLE_COSTS_PACKAGING]) || 0
        };

        const totalFixedCosts = Object.values(fixedCosts).reduce((sum, cost) => sum + cost, 0);
        const totalVariableCosts = Object.values(variableCosts).reduce((sum, cost) => sum + cost, 0);

        // Criar perfil completo do usuário
        await createUserProfile({
            uid: session.userId,
            email: '', // Será preenchido pelo auth
            displayName: data[OnboardingStep.NAME],
            plan: 'free',
            preferences: {
                language: 'pt-BR',
                timezone: 'America/Sao_Paulo',
                notifications: true
            }
        });

        // Criar estrutura financeira baseada na planilha
        const userRef = this.db.collection('users').doc(session.userId);
        
        await userRef.set({
            profile: {
                displayName: data[OnboardingStep.NAME],
                businessName: data[OnboardingStep.BUSINESS_NAME],
                goals: [data[OnboardingStep.GOALS]],
                pricingStrategy: data[OnboardingStep.PRICING_STRATEGY],
                monthlyGoal: parseFloat(data[OnboardingStep.MONTHLY_GOAL]) || 0,
                onboardingCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
                isOnboardingCompleted: true
            },
            financialStructure: {
                fixedCosts,
                variableCosts,
                totals: {
                    fixedCosts: totalFixedCosts,
                    variableCosts: totalVariableCosts,
                    totalMonthlyCosts: totalFixedCosts + totalVariableCosts
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }
        }, { merge: true });

        // Marcar sessão como completa
        await this.db.collection('onboarding_sessions').doc(session.userId).update({
            isCompleted: true,
            completedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        logger.info(`Onboarding completo para usuário ${session.userId}`, {
            businessName: data[OnboardingStep.BUSINESS_NAME],
            totalFixedCosts,
            totalVariableCosts
        });
    }
}

// Função para iniciar onboarding
export const startOnboarding = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    try {
        const session = await OnboardingAgent.startOnboarding(request.auth.uid);
        const welcomeMessage = OnboardingAgent.getWelcomeMessage();

        return {
            success: true,
            session,
            ...welcomeMessage
        };
    } catch (error: any) {
        logger.error('Erro ao iniciar onboarding:', error);
        throw new HttpsError('internal', 'Erro ao iniciar onboarding', { error: error.message });
    }
});

// Função para processar resposta do onboarding
export const processOnboardingResponse = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    const { response } = request.data;

    if (!response || typeof response !== 'string') {
        throw new HttpsError('invalid-argument', 'Resposta é obrigatória');
    }

    try {
        const result = await OnboardingAgent.processResponse(request.auth.uid, response);

        return {
            success: true,
            ...result
        };
    } catch (error: any) {
        logger.error('Erro ao processar resposta do onboarding:', error);
        throw new HttpsError('internal', 'Erro ao processar resposta', { error: error.message });
    }
});

// Função para obter status do onboarding
export const getOnboardingStatus = onCall({ region: 'southamerica-east1' }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Usuário não autenticado');
    }

    try {
        const session = await OnboardingAgent.getSession(request.auth.uid);
        
        if (!session) {
            return {
                success: true,
                needsOnboarding: true,
                message: "Vamos começar configurando sua confeitaria! 🍰"
            };
        }

        if (session.isCompleted) {
            return {
                success: true,
                needsOnboarding: false,
                isCompleted: true,
                message: "Onboarding já concluído! ✨"
            };
        }

        // Retomar onboarding em andamento
        const currentMessage = ONBOARDING_MESSAGES[session.currentStep];
        const formattedMessage = OnboardingAgent['formatMessage'](
            currentMessage.message, 
            session.collectedData
        );

        return {
            success: true,
            needsOnboarding: true,
            isCompleted: false,
            currentStep: session.currentStep,
            message: formattedMessage,
            options: currentMessage.options,
            placeholder: currentMessage.placeholder,
            hint: currentMessage.hint
        };
    } catch (error: any) {
        logger.error('Erro ao obter status do onboarding:', error);
        throw new HttpsError('internal', 'Erro ao obter status', { error: error.message });
    }
});
