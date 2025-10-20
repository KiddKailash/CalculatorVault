import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PhotoVault from "./_vault/PhotoVault";

interface Token {
  type: "number" | "operator";
  value: string;
}

const tokenizeExpression = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let currentNumber = "";

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];

    if ((char >= "0" && char <= "9") || char === ".") {
      currentNumber += char;
    } else if (["+", "-", "×", "÷"].includes(char)) {
      // Handle negative numbers at the start or after operators
      if (
        char === "-" &&
        (i === 0 || ["+", "-", "×", "÷"].includes(expression[i - 1]))
      ) {
        currentNumber += char;
      } else {
        if (currentNumber) {
          tokens.push({ type: "number", value: currentNumber });
          currentNumber = "";
        }
        tokens.push({ type: "operator", value: char });
      }
    }
  }

  if (currentNumber) {
    tokens.push({ type: "number", value: currentNumber });
  }

  return tokens;
};

const evaluateExpression = (expression: string): number => {
  if (!expression || expression === "0") return 0;

  const tokens = tokenizeExpression(expression);
  if (tokens.length === 0) return 0;

  const numbers: number[] = [];
  const operators: string[] = [];

  const precedence: { [key: string]: number } = {
    "+": 1,
    "-": 1,
    "×": 2,
    "÷": 2,
  };

  const applyOperation = () => {
    if (numbers.length < 2 || operators.length === 0) return;

    const b = numbers.pop()!;
    const a = numbers.pop()!;
    const op = operators.pop()!;

    let result: number;
    switch (op) {
      case "+":
        result = a + b;
        break;
      case "-":
        result = a - b;
        break;
      case "×":
        result = a * b;
        break;
      case "÷":
        result = a / b;
        break;
      default:
        result = b;
    }

    numbers.push(result);
  };

  for (const token of tokens) {
    if (token.type === "number") {
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

  while (operators.length > 0) {
    applyOperation();
  }

  return numbers[0] || 0;
};

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [equation, setEquation] = useState("");
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [showPhotoVault, setShowPhotoVault] = useState(false);

  useEffect(() => {
    checkPasswordStatus();
  }, []);

  const checkPasswordStatus = async () => {
    try {
      const storedPassword = await AsyncStorage.getItem("calculator_password");
      if (storedPassword) {
        setPasswordSet(true);
      } else {
        setPasswordSet(false);
        setIsSettingPassword(true);
      }
    } catch (error) {
      console.error("Error checking password status:", error);
      setPasswordSet(false);
      setIsSettingPassword(true);
    }
  };

  const savePassword = async (password: string) => {
    try {
      await AsyncStorage.setItem("calculator_password", password);
      setPasswordSet(true);
      setIsSettingPassword(false);
      setConfirmingPassword(false);
      setPasswordInput("");
      setConfirmPasswordInput("");
      setDisplay("0");
      setEquation("");
    } catch (error) {
      console.error("Error saving password:", error);
    }
  };

  const verifyPassword = async (inputEquation: string): Promise<boolean> => {
    try {
      const storedPassword = await AsyncStorage.getItem("calculator_password");
      return storedPassword === inputEquation;
    } catch (error) {
      console.error("Error verifying password:", error);
      return false;
    }
  };

  const inputDigit = (digit: string) => {
    if (isSettingPassword) {
      if (confirmingPassword) {
        const newConfirmInput = confirmPasswordInput + digit;
        setConfirmPasswordInput(newConfirmInput);
        setDisplay(newConfirmInput);
      } else {
        const newPasswordInput = passwordInput + digit;
        setPasswordInput(newPasswordInput);
        setDisplay(newPasswordInput);
      }
      return;
    }

    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
      setEquation(equation + digit);
    } else {
      const newDisplay = display === "0" ? digit : display + digit;
      setDisplay(newDisplay);
      if (equation) {
        setEquation(equation + digit);
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const inputDecimal = () => {
    if (isSettingPassword) {
      inputDigit(".");
      return;
    }

    if (waitingForOperand) {
      setDisplay("0.");
      setWaitingForOperand(false);
      setEquation(equation + "0.");
    } else if (display.indexOf(".") === -1) {
      const newDisplay = display + ".";
      setDisplay(newDisplay);
      if (equation) {
        setEquation(equation + ".");
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const clear = () => {
    if (isSettingPassword) {
      if (confirmingPassword) {
        setConfirmPasswordInput("");
        setDisplay("Confirm Password");
      } else {
        setPasswordInput("");
        setDisplay("Set Password");
      }
      return;
    }

    setDisplay("0");
    setWaitingForOperand(false);
    setEquation("");
  };

  const handleOperation = async (nextOperation: string) => {
    if (nextOperation === "=") {
      if (isSettingPassword) {
        if (confirmingPassword) {
          // Confirm password
          if (passwordInput === confirmPasswordInput) {
            savePassword(passwordInput);
          } else {
            setDisplay("Passwords do not match");
            setTimeout(() => {
              setConfirmPasswordInput("");
              setDisplay("Confirm Password");
            }, 2000);
          }
        } else {
          // Move to confirmation step
          setConfirmingPassword(true);
          setDisplay("Confirm Password");
        }
        return;
      }

      if (equation) {
        // Check if the equation matches the stored password
        const isPasswordCorrect = await verifyPassword(equation);

        if (isPasswordCorrect) {
          // Navigate to photo vault
          setShowPhotoVault(true);
          return;
        }

        // Normal calculation
        const result = evaluateExpression(equation);
        setDisplay(String(result));
        setEquation("");
        setWaitingForOperand(true);
      }
    } else {
      if (isSettingPassword) {
        inputDigit(nextOperation);
        return;
      }

      if (equation) {
        setEquation(equation + nextOperation);
      } else {
        setEquation(display + nextOperation);
      }
      setWaitingForOperand(true);
    }
  };

  const handlePercentage = () => {
    if (isSettingPassword) {
      inputDigit("%");
      return;
    }

    const value = parseFloat(display);
    setDisplay(String(value / 100));
    setEquation("");
  };

  const handlePlusMinus = () => {
    if (isSettingPassword) {
      inputDigit("±");
      return;
    }
    if (display !== "0") {
      const newDisplay =
        display.charAt(0) === "-" ? display.substring(1) : "-" + display;
      setDisplay(newDisplay);

      // Update equation if it exists
      if (equation) {
        // Find the last number in the equation and update it
        const lastOperatorIndex = Math.max(
          equation.lastIndexOf("+"),
          equation.lastIndexOf("-"),
          equation.lastIndexOf("×"),
          equation.lastIndexOf("÷")
        );

        if (lastOperatorIndex === -1) {
          // No operators, whole equation is a number
          setEquation(newDisplay);
        } else {
          // Replace the last number with the new display
          const beforeLastNumber = equation.substring(0, lastOperatorIndex + 1);
          setEquation(beforeLastNumber + newDisplay);
        }
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const Button = ({
    onPress,
    text,
    style,
    textStyle,
  }: {
    onPress: () => void;
    text: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
  }) => (
    <TouchableOpacity style={[styles.button, style]} onPress={onPress}>
      <Text style={[styles.buttonText, textStyle]}>{text}</Text>
    </TouchableOpacity>
  );

  // Show photo vault if password was correctly entered
  if (showPhotoVault) {
    return (
      <PhotoVault
        onBack={() => {
          setShowPhotoVault(false);
          setDisplay("0");
          setEquation("");
          setWaitingForOperand(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {passwordSet === null
            ? "Loading..."
            : isSettingPassword
            ? confirmingPassword
              ? confirmPasswordInput || "Confirm Password"
              : passwordInput || "Set Password"
            : equation || display}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <View style={styles.row}>
          <Button
            onPress={clear}
            text="AC"
            style={styles.functionButton}
            textStyle={styles.functionButtonText}
          />
          <Button
            onPress={handlePlusMinus}
            text="±"
            style={styles.functionButton}
            textStyle={styles.functionButtonText}
          />
          <Button
            onPress={handlePercentage}
            text="%"
            style={styles.functionButton}
            textStyle={styles.functionButtonText}
          />
          <Button
            onPress={() => handleOperation("÷")}
            text="÷"
            style={styles.operatorButton}
            textStyle={styles.operatorButtonText}
          />
        </View>

        <View style={styles.row}>
          <Button
            onPress={() => inputDigit("7")}
            text="7"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("8")}
            text="8"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("9")}
            text="9"
            style={styles.numberButton}
          />
          <Button
            onPress={() => handleOperation("×")}
            text="×"
            style={styles.operatorButton}
            textStyle={styles.operatorButtonText}
          />
        </View>

        <View style={styles.row}>
          <Button
            onPress={() => inputDigit("4")}
            text="4"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("5")}
            text="5"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("6")}
            text="6"
            style={styles.numberButton}
          />
          <Button
            onPress={() => handleOperation("-")}
            text="-"
            style={styles.operatorButton}
            textStyle={styles.operatorButtonText}
          />
        </View>

        <View style={styles.row}>
          <Button
            onPress={() => inputDigit("1")}
            text="1"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("2")}
            text="2"
            style={styles.numberButton}
          />
          <Button
            onPress={() => inputDigit("3")}
            text="3"
            style={styles.numberButton}
          />
          <Button
            onPress={() => handleOperation("+")}
            text="+"
            style={styles.operatorButton}
            textStyle={styles.operatorButtonText}
          />
        </View>

        <View style={styles.row}>
          <Button
            onPress={() => inputDigit("0")}
            text="0"
            style={[styles.numberButton, styles.zeroButton]}
          />
          <Button onPress={inputDecimal} text="." style={styles.numberButton} />
          <Button
            onPress={() => handleOperation("=")}
            text="="
            style={styles.operatorButton}
            textStyle={styles.operatorButtonText}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    height: '100%',
    width: '100%',
  },
  displayContainer: {
    flex: 0.6,
    height: '100%',
    width: '100%',
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 0,
  },
  displayText: {
    color: "#ff9500",
    fontSize: 60,
    fontWeight: "200",
    textAlign: "right",
  },
  buttonContainer: {
    flex: 1,
    justifyContent: "flex-end",
    marginHorizontal: "auto",
    gap: 10, // for platforms that support it
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    flex: 1,
    gap: 10, // dynamic gap, only works on RN >= 0.71
    width: "100%",
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    flex: 0,
  },
  zeroButton: {
    borderRadius: 40,
    width: 170,
  },
  buttonText: {
    fontSize: 30,
    fontWeight: "400",
  },
  numberButton: {
    backgroundColor: "#333333",
  },
  functionButton: {
    backgroundColor: "#a6a6a6",
  },
  functionButtonText: {
    color: "#000000",
  },
  operatorButton: {
    backgroundColor: "#ff9500",
  },
  operatorButtonText: {
    color: "white",
  },
});
