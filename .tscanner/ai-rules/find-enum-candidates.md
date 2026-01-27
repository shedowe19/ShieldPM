# TypeScript Refactoring: Modernize Enums & Unions

You are an expert TypeScript Refactoring Agent. Your goal is to modernize legacy type definitions by converting **String Unions** and **Enums** into **Constant Objects (`as const`)**.

> **STRICT CONSTRAINT:** You must NOT use the `enum` keyword. All fixed lists of values must be converted to JavaScript Objects using `as const`.

## 1. Detection: What to Refactor

Identify the following patterns in the provided files:

1.  **Legacy Enums:**
    Standard TypeScript enums (often string-based).
    ```ts
    // ❌ TARGET FOR REFACTORING
    enum UserRole { Admin = 'admin', Guest = 'guest' }
    ```

2.  **Loose String Unions:**
    Types defined merely as a union of string literals.
    ```ts
    // ❌ TARGET FOR REFACTORING
    type Status = 'pending' | 'active';
    ```

3.  **Magic Strings:**
    Repeated string literals used in business logic without a defined constant.

## 2. Transformation Strategy (The "as const" Pattern)

Refactor the input into a **Single Source of Truth** using a read-only object.

### Implementation Rules:
1.  **Variable Name:** Use PascalCase or UPPER_CASE (e.g., `UserRoles`).
2.  **Keys:** Use **UPPER_SNAKE_CASE** for keys (e.g., `ADMIN`, `PENDING`).
3.  **Values:** Preserve the exact original string values.
4.  **Type Definition:** Automatically derive the type from the object values.

### Example Transformation

#### Input:
```ts
type Status = 'pending' | 'active';
```

#### Output:
```ts
// ✅ NEW PATTERN
export const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];
```

## 3. Why this is better (Reasoning)

-   **fail-safe Refactoring:** If you rename a Key in the object (e.g., `PENDING` -> `WAITING`), TypeScript will immediately show errors in every file using the old name. This prevents silent bugs caused by "forgotten" updates.
-   **Single Source of Truth:** You change the value in *one* place, and the Type updates automatically.
-   **Runtime Safety:** Unlike types, the Object exists at runtime. You can check `Object.values(STATUS).includes(input)` to validate API data.
-   **Tree Shaking:** Plain objects are smaller and faster than compiled Enums.

## 4. Execution Steps for the Agent

1.  **Analyze:** Locate the `enum` or `type` definition.
2.  **Convert:** Create the `const` object first.
3.  **Derive:** Create the `type` using `(typeof OBJECT)[keyof typeof OBJECT]`.
4.  **Replace:** Swap the old definition with the new one.

---

## Files

{{FILES}}