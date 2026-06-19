export interface Token {
  type: 'number' | 'operator';
  value: string;
}

export const tokenizeExpression = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let currentNumber = '';

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    if ((char >= '0' && char <= '9') || char === '.') {
      currentNumber += char;
    } else if (['+', '-', '×', '÷'].includes(char)) {
      if (
        char === '-' &&
        (i === 0 || ['+', '-', '×', '÷'].includes(expression[i - 1]))
      ) {
        currentNumber += char;
      } else {
        if (currentNumber) {
          tokens.push({ type: 'number', value: currentNumber });
          currentNumber = '';
        }
        tokens.push({ type: 'operator', value: char });
      }
    }
  }

  if (currentNumber) tokens.push({ type: 'number', value: currentNumber });
  return tokens;
};

export const evaluateExpression = (expression: string): number => {
  if (!expression || expression === '0') return 0;

  const tokens = tokenizeExpression(expression);
  if (tokens.length === 0) return 0;

  const numbers: number[] = [];
  const operators: string[] = [];

  const precedence: { [key: string]: number } = {
    '+': 1,
    '-': 1,
    '×': 2,
    '÷': 2,
  };

  const applyOperation = () => {
    if (numbers.length < 2 || operators.length === 0) return;
    const b = numbers.pop()!;
    const a = numbers.pop()!;
    const op = operators.pop()!;
    let result: number;
    switch (op) {
      case '+': result = a + b; break;
      case '-': result = a - b; break;
      case '×': result = a * b; break;
      case '÷': result = b === 0 ? NaN : a / b; break;
      default: result = b;
    }
    numbers.push(result);
  };

  for (const token of tokens) {
    if (token.type === 'number') {
      numbers.push(parseFloat(token.value));
    } else {
      while (
        operators.length > 0 &&
        precedence[operators[operators.length - 1]] >= precedence[token.value]
      ) {
        applyOperation();
      }
      operators.push(token.value);
    }
  }

  while (operators.length > 0) applyOperation();
  return numbers.length > 0 ? numbers[0] : 0;
};
