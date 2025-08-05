import React, { useState } from "react";

interface OnboardingProps {
  onComplete: () => void;
}

const questions = [
  {
    id: "name",
    question: "Como você gostaria de ser chamado(a)?",
    placeholder: "Digite seu nome...",
  },
  {
    id: "businessName",
    question: "Qual é o nome da sua confeitaria?",
    placeholder: "Nome da sua confeitaria...",
  },
  {
    id: "goal",
    question: "Qual é seu principal objetivo agora?",
    options: [
      "Controlar melhor os custos",
      "Organizar pedidos e agenda",
      "Aumentar o lucro",
      "Precificar produtos corretamente",
      "Ter controle completo do negócio",
    ],
  },
  {
    id: "fixedCostsRent",
    question: "Quanto você paga mensalmente de aluguel? (Se não paga, pode colocar 0)",
    placeholder: "Ex: 1200",
  },
  {
    id: "fixedCostsUtilities",
    question: "Quanto gasta por mês com água, luz e gás?",
    placeholder: "Ex: 300",
  },
  {
    id: "fixedCostsInternet",
    question: "Quanto paga de internet e telefone por mês?",
    placeholder: "Ex: 150",
  },
  {
    id: "fixedCostsSalary",
    question: "Quanto paga de salário ou pró-labore por mês? (Se não tem, coloque 0)",
    placeholder: "Ex: 2000",
  },
  {
    id: "fixedCostsOther",
    question: "Tem mais algum custo fixo? Como seguro, contador, licenças? (Se não tem, pode colocar 0)",
    placeholder: "Ex: 200",
  },
  {
    id: "variableCostsIngredients",
    question: "Quanto você gasta em média por mês com ingredientes?",
    placeholder: "Ex: 800",
  },
  {
    id: "variableCostsPackaging",
    question: "Quanto gasta com embalagens, caixas, sacolas por mês?",
    placeholder: "Ex: 200",
  },
  {
    id: "pricingStrategy",
    question: "Como você define o preço dos seus produtos hoje?",
    options: [
      "Custo + margem fixa (ex: custo + 50%)",
      "Preço da concorrência",
      "Feeling/experiência",
      "Ainda não tenho método definido",
    ],
  },
  {
    id: "monthlyGoal",
    question: "Qual sua meta de faturamento mensal?",
    placeholder: "Ex: 5000",
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentQuestion = questions[currentStep];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setAnswers({
      ...answers,
      [currentQuestion.id]: e.target.value,
    });
  };

  const handleNext = () => {
    if (!answers[currentQuestion.id]) {
      alert("Por favor, responda a pergunta antes de continuar.");
      return;
    }
    if (currentStep === questions.length - 1) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Configuração Inicial</h2>
      <p className="mb-6">{currentQuestion.question}</p>
      {currentQuestion.options ? (
        <select
          value={answers[currentQuestion.id] || ""}
          onChange={handleInputChange}
          className="w-full p-3 border rounded"
        >
          <option value="">Selecione uma opção</option>
          {currentQuestion.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          placeholder={currentQuestion.placeholder}
          value={answers[currentQuestion.id] || ""}
          onChange={handleInputChange}
          className="w-full p-3 border rounded"
        />
      )}
      <button
        onClick={handleNext}
        className="mt-4 w-full bg-blue-600 text-white py-3 rounded hover:bg-blue-700"
      >
        {currentStep === questions.length - 1 ? "Finalizar" : "Próximo"}
      </button>
    </div>
  );
};

export default Onboarding;
