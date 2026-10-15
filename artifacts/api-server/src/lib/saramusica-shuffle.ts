/* Questo codice è stato progettato, scritto e generato da Andrea Gentile C.f GNTNDR88S28F158M */

/* Logica PURA di rimescolamento risposte di SaraMusica — estratta dal generatore così
 * da essere testabile con `node --test` senza trascinare logger/openai (che hanno import
 * .js non risolvibili a runtime dai test). Il generatore e il server la riusano. */

export function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * BUG SARAMUSICA (Andrea "praticamente ingiocabile"): nel banco ogni round è scritto con
 * `c: 0`, cioè la risposta giusta è SEMPRE il primo pulsante ("A"), e nessun percorso
 * mescolava le risposte → quiz banalmente indovinabile a ogni domanda. Questo helper
 * rimescola l'ordine delle risposte e rimappa `correctAnswerIndex` di conseguenza.
 * Salta i round senza vera scelta multipla (es. singing_duel: nessun array di risposte).
 * Generico sui soli campi che tocca, così resta indipendente dal tipo MusicRound.
 */
export function shuffleRoundAnswers<T extends { answers: string[]; correctAnswerIndex: number }>(round: T): T {
  const answers = round.answers;
  if (!Array.isArray(answers) || answers.length < 2) return round;
  const correctValue = answers[round.correctAnswerIndex];
  if (correctValue === undefined) return round;
  const shuffled = shuffleArr(answers);
  const newIndex = shuffled.indexOf(correctValue);
  return { ...round, answers: shuffled, correctAnswerIndex: newIndex >= 0 ? newIndex : 0 };
}
