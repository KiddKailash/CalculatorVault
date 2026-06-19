import * as ScreenCapture from "expo-screen-capture";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
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
import SecureSession, {
  getPasswordStrength,
  MIN_PASSWORD_TOKENS,
  PASSWORD_OPERATORS,
  PasswordTooWeakError,
  VaultLockedOutError,
} from "../src/vault/_SecureSession";
import { evaluateExpression } from "../src/vault/_calculator";
import PhotoVault from "../src/vault/PhotoVault";
import VaultStorage from "../src/vault/_VaultStorage";

export default function Calculator() {
  const session = useMemo(() => new SecureSession(), []);
  const storage = useMemo(() => new VaultStorage(session), [session]);

  const [display, setDisplay] = useState("0");
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [equation, setEquation] = useState("");
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [showPhotoVault, setShowPhotoVault] = useState(false);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const inSecureContext = isSettingPassword || showPhotoVault;
  const screenCaptureActive = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPasswordHint = (msg: string, ms = 1500) => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setPasswordHint(msg);
    hintTimerRef.current = setTimeout(() => {
      setPasswordHint(null);
      hintTimerRef.current = null;
    }, ms);
  };

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ready = await session.isInitialized();
      if (cancelled) return;
      setPasswordSet(ready);
      setIsSettingPassword(!ready);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (inSecureContext && !screenCaptureActive.current) {
          await ScreenCapture.preventScreenCaptureAsync("vault");
          if (mounted) screenCaptureActive.current = true;
        } else if (!inSecureContext && screenCaptureActive.current) {
          await ScreenCapture.allowScreenCaptureAsync("vault");
          if (mounted) screenCaptureActive.current = false;
        }
      } catch {
        // best effort
      }
    })();
    return () => {
      mounted = false;
    };
  }, [inSecureContext]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") {
        session.lock();
        storage.scrubDecryptedCache();
        setShowPhotoVault(false);
        setEquation("");
        setDisplay("0");
        setWaitingForOperand(false);
      }
    });
    return () => sub.remove();
  }, [session, storage]);

  const savePassword = async (password: string) => {
    setIsSavingPassword(true);
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    setPasswordHint("Encrypting vault… this can take a few seconds");
    // Yield so React renders the hint before PBKDF2 blocks the JS thread.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    try {
      await session.initialize(password);
      setPasswordSet(true);
      setIsSettingPassword(false);
      setConfirmingPassword(false);
      setPasswordInput("");
      setConfirmPasswordInput("");
      setPasswordHint(null);
      setDisplay("0");
      setEquation("");
    } catch (error) {
      if (error instanceof PasswordTooWeakError) {
        showPasswordHint(`Need ${MIN_PASSWORD_TOKENS}+ inputs with operator`);
      } else {
        console.warn("savePassword failed:", error);
        const detail = error instanceof Error && error.message ? error.message : String(error);
        showPasswordHint(`Error: ${detail.slice(0, 80)}`, 4000);
        await session.reset().catch(() => {});
      }
      setPasswordInput("");
      setConfirmPasswordInput("");
      setConfirmingPassword(false);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const tryUnlock = async (candidate: string): Promise<boolean> => {
    try {
      return await session.unlock(candidate);
    } catch (error) {
      if (error instanceof VaultLockedOutError) {
        const secs = Math.ceil(error.retryAfterMs / 1000);
        flashDisplay(`Locked ${secs}s`);
      }
      return false;
    }
  };

  const flashDisplay = (msg: string) => {
    setDisplay(msg);
    setTimeout(() => {
      setDisplay("0");
      setEquation("");
    }, 1500);
  };

  const inputDigit = (digit: string) => {
    if (isSavingPassword) return;
    if (isSettingPassword) {
      if (confirmingPassword) {
        const v = confirmPasswordInput + digit;
        setConfirmPasswordInput(v);
        setDisplay(v);
      } else {
        const v = passwordInput + digit;
        setPasswordInput(v);
        setDisplay(v);
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
      if (equation) setEquation(equation + digit);
      else setEquation(newDisplay);
    }
  };

  const inputDecimal = () => {
    if (isSavingPassword) return;
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
      if (equation) setEquation(equation + ".");
      else setEquation(newDisplay);
    }
  };

  const clear = () => {
    if (isSavingPassword) return;
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
    if (isSavingPassword) return;
    if (nextOperation === "=") {
      if (isSettingPassword) {
        if (confirmingPassword) {
          if (passwordInput === confirmPasswordInput) {
            await savePassword(passwordInput);
          } else {
            setConfirmPasswordInput("");
            showPasswordHint("Passwords do not match");
          }
        } else {
          const { ok, lengthOk, hasOperator } = getPasswordStrength(passwordInput);
          if (!ok) {
            const reasons: string[] = [];
            if (!lengthOk) reasons.push(`${MIN_PASSWORD_TOKENS}+ inputs`);
            if (!hasOperator) reasons.push("operator required");
            showPasswordHint(`Too weak · ${reasons.join(" · ")}`);
            return;
          }
          setConfirmingPassword(true);
        }
        return;
      }

      if (equation) {
        const unlocked = await tryUnlock(equation);
        if (unlocked) {
          setShowPhotoVault(true);
          return;
        }
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
      if (equation) setEquation(equation + nextOperation);
      else setEquation(display + nextOperation);
      setWaitingForOperand(true);
    }
  };

  const handlePercentage = () => {
    if (isSavingPassword) return;
    if (isSettingPassword) {
      inputDigit("%");
      return;
    }
    const value = parseFloat(display);
    setDisplay(String(value / 100));
    setEquation("");
  };

  const devResetVault = async () => {
    if (!__DEV__) return;
    try {
      session.lock();
      await session.reset();
      storage.scrubDecryptedCache();
    } catch (error) {
      console.warn("devResetVault failed:", error);
    }
    setShowPhotoVault(false);
    setPasswordInput("");
    setConfirmPasswordInput("");
    setConfirmingPassword(false);
    setDisplay("0");
    setEquation("");
    setWaitingForOperand(false);
    setPasswordSet(false);
    setIsSettingPassword(true);
    setIsSavingPassword(false);
    showPasswordHint("Vault reset (dev)", 2000);
  };

  const handlePlusMinus = () => {
    if (isSavingPassword) return;
    if (isSettingPassword) {
      inputDigit("±");
      return;
    }
    if (display !== "0") {
      const newDisplay =
        display.charAt(0) === "-" ? display.substring(1) : "-" + display;
      setDisplay(newDisplay);
      if (equation) {
        const lastOperatorIndex = Math.max(
          equation.lastIndexOf("+"),
          equation.lastIndexOf("-"),
          equation.lastIndexOf("×"),
          equation.lastIndexOf("÷")
        );
        if (lastOperatorIndex === -1) setEquation(newDisplay);
        else {
          const beforeLastNumber = equation.substring(0, lastOperatorIndex + 1);
          setEquation(beforeLastNumber + newDisplay);
        }
      } else {
        setEquation(newDisplay);
      }
    }
  };

  const strengthLabel = useMemo(() => {
    if (!isSettingPassword) return null;
    if (confirmingPassword) {
      if (confirmPasswordInput.length === 0) return "Re-enter to confirm";
      return `${confirmPasswordInput.length}/${passwordInput.length} entered`;
    }
    if (passwordInput.length === 0) {
      return `${MIN_PASSWORD_TOKENS}+ inputs · needs operator (${PASSWORD_OPERATORS.join("")})`;
    }
    const { lengthOk, hasOperator, ok } = getPasswordStrength(passwordInput);
    if (ok) return "Strong · tap = to continue";
    const parts: string[] = [];
    if (!lengthOk) parts.push(`${passwordInput.length}/${MIN_PASSWORD_TOKENS} inputs`);
    if (!hasOperator) parts.push("add operator");
    return parts.join(" · ");
  }, [isSettingPassword, confirmingPassword, passwordInput, confirmPasswordInput]);

  const subtitle = passwordHint ?? strengthLabel;

  const Button = ({
    onPress,
    onLongPress,
    text,
    style,
    textStyle,
  }: {
    onPress: () => void;
    onLongPress?: () => void;
    text: string;
    style?: StyleProp<ViewStyle>;
    textStyle?: StyleProp<TextStyle>;
  }) => (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={1200}
    >
      <Text style={[styles.buttonText, textStyle]}>{text}</Text>
    </TouchableOpacity>
  );

  if (showPhotoVault) {
    return (
      <PhotoVault
        storage={storage}
        onBack={() => {
          session.lock();
          storage.scrubDecryptedCache();
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
        {subtitle ? (
          <Text style={styles.subtitleText} numberOfLines={1} adjustsFontSizeToFit>
            {subtitle}
          </Text>
        ) : null}
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
          <Button onPress={clear} onLongPress={__DEV__ ? devResetVault : undefined} text="AC" style={styles.functionButton} textStyle={styles.functionButtonText} />
          <Button onPress={handlePlusMinus} text="±" style={styles.functionButton} textStyle={styles.functionButtonText} />
          <Button onPress={handlePercentage} text="%" style={styles.functionButton} textStyle={styles.functionButtonText} />
          <Button onPress={() => handleOperation("÷")} text="÷" style={styles.operatorButton} textStyle={styles.operatorButtonText} />
        </View>
        <View style={styles.row}>
          <Button onPress={() => inputDigit("7")} text="7" style={styles.numberButton} />
          <Button onPress={() => inputDigit("8")} text="8" style={styles.numberButton} />
          <Button onPress={() => inputDigit("9")} text="9" style={styles.numberButton} />
          <Button onPress={() => handleOperation("×")} text="×" style={styles.operatorButton} textStyle={styles.operatorButtonText} />
        </View>
        <View style={styles.row}>
          <Button onPress={() => inputDigit("4")} text="4" style={styles.numberButton} />
          <Button onPress={() => inputDigit("5")} text="5" style={styles.numberButton} />
          <Button onPress={() => inputDigit("6")} text="6" style={styles.numberButton} />
          <Button onPress={() => handleOperation("-")} text="-" style={styles.operatorButton} textStyle={styles.operatorButtonText} />
        </View>
        <View style={styles.row}>
          <Button onPress={() => inputDigit("1")} text="1" style={styles.numberButton} />
          <Button onPress={() => inputDigit("2")} text="2" style={styles.numberButton} />
          <Button onPress={() => inputDigit("3")} text="3" style={styles.numberButton} />
          <Button onPress={() => handleOperation("+")} text="+" style={styles.operatorButton} textStyle={styles.operatorButtonText} />
        </View>
        <View style={styles.row}>
          <Button onPress={() => inputDigit("0")} text="0" style={[styles.numberButton, styles.zeroButton]} />
          <Button onPress={inputDecimal} text="." style={styles.numberButton} />
          <Button onPress={() => handleOperation("=")} text="=" style={styles.operatorButton} textStyle={styles.operatorButtonText} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000", height: "100%", width: "100%" },
  displayContainer: {
    flex: 0.6,
    height: "100%",
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 0,
  },
  displayText: { color: "#ff9500", fontSize: 60, fontWeight: "200", textAlign: "right" },
  subtitleText: { color: "#888888", fontSize: 14, fontWeight: "400", textAlign: "right", paddingBottom: 8 },
  buttonContainer: { flex: 1, justifyContent: "flex-end", marginHorizontal: "auto", gap: 10 },
  row: { flexDirection: "row", alignItems: "stretch", flex: 1, gap: 10, width: "100%" },
  button: { width: 80, height: 80, borderRadius: 40, justifyContent: "center", alignItems: "center", flex: 0 },
  zeroButton: { borderRadius: 40, width: 170 },
  buttonText: { fontSize: 30, fontWeight: "400" },
  numberButton: { backgroundColor: "#333333" },
  functionButton: { backgroundColor: "#a6a6a6" },
  functionButtonText: { color: "#000000" },
  operatorButton: { backgroundColor: "#ff9500" },
  operatorButtonText: { color: "white" },
});
