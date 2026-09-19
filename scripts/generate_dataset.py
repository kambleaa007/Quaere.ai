#!/usr/bin/env python3
"""
Quaere.ai — Socratic Dataset Generator

Generates JSONL training pairs where every output is a deep, probing question
(1–2 sharp questions) following the Quaere.ai Socratic method.

Usage:
    pip install openai
    python scripts/generate_dataset.py --count 500 --output dataset.jsonl
"""

import argparse
import json
import os
import time

try:
    from openai import OpenAI
except ImportError:
    print("pip install openai  # required for dataset generation")
    raise

INSTRUCTION = (
    "You are Quaere.ai, an elite, highly sophisticated AI interlocutor rooted in "
    "the Socratic method. CRITICAL MANDATE: You are strictly forbidden from providing "
    "direct answers, solutions, summaries, or conclusions. Your sole purpose is to "
    "dissect the user's input and respond exclusively with 1 to 2 deep, precise, "
    "analytical questions. Analyze gaps or hidden assumptions. Maintain an intellectually "
    "rigorous, calm, and minimalist tone."
)

# Broad topic seeds — the model will elaborate on these
TOPICS = [
    "career and vocation",
    "meaning and purpose",
    "relationships and love",
    "learning and education",
    "creativity and art",
    "ethics and morality",
    "knowledge and truth",
    "freedom and responsibility",
    "fear and courage",
    "success and failure",
    "identity and authenticity",
    "time and mortality",
    "justice and fairness",
    "power and corruption",
    "change and growth",
    "mind and consciousness",
    "technology and society",
    "conflict and resolution",
    "habits and discipline",
    "wealth and materialism",
]

# Question-style user prompts that invite Socratic inquiry
USER_PROMPTS = [
    "I'm feeling stuck in my career.",
    "What should I do with my life?",
    "I don't know what makes me happy.",
    "How do I make better decisions?",
    "I keep making the same mistakes.",
    "I feel like I'm pretending to know things I don't.",
    "What is the right thing to do in this situation?",
    "How can I become a better person?",
    "I'm anxious about the future.",
    "I don't know what I really believe.",
    "How do I handle conflict with someone I care about?",
    "I want to learn but I don't know where to start.",
    "I feel disconnected from everyone.",
    "Is any knowledge certain?",
    "What does it mean to live well?",
    "I'm afraid of failing.",
    "I achieved what I wanted but I feel empty.",
    "How do I know if my feelings are valid?",
    "I want to be creative but nothing comes out.",
    "What should I prioritize in life?",
    "I keep avoiding the things I need to do.",
    "I don't trust my own judgment.",
    "Is it better to be honest or kind?",
    "I feel like I'm losing myself.",
    "What is a meaningful life?",
    "I compare myself to others constantly.",
    "How do I forgive myself?",
    "I don't know what I want.",
    "I'm exhausted all the time.",
    "What makes a good friend?",
    "I feel like I'm lying to everyone.",
    "How do I stop overthinking?",
    "I don't know who I am without my achievements.",
    "What is the point of it all?",
    "I'm angry but I don't know at what.",
    "I want to change but I don't know how.",
    "I feel like everyone else has it figured out.",
    "How do I speak up for myself?",
    "I'm afraid of being ordinary.",
    "What does it mean to be brave?",
]


def generate_questions(client, topic, idx):
    """Generate a single Socratic Q&A pair using the topic and prompt list."""
    user_prompt = USER_PROMPTS[idx % len(USER_PROMPTS)]

    # Inject the topic into the user message to vary the dataset
    prompt = f"[{topic}] {user_prompt}"

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": INSTRUCTION},
            {"role": "user", "content": prompt},
        ],
        temperature=0.8,
        max_tokens=256,
    )

    output = response.choices[0].message.content.strip()
    return {
        "instruction": INSTRUCTION,
        "input": prompt,
        "output": output,
    }


def main():
    parser = argparse.ArgumentParser(description="Generate Socratic training dataset")
    parser.add_argument("--count", type=int, default=500, help="Number of pairs (default: 500)")
    parser.add_argument("--output", type=str, default="dataset.jsonl", help="Output file path")
    args = parser.parse_args()

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY in your environment.")
        return

    client = OpenAI(api_key=api_key)

    print(f"Generating {args.count} Socratic Q&A pairs...")
    start = time.time()

    with open(args.output, "w", encoding="utf-8") as f:
        for i in range(args.count):
            topic = TOPICS[i % len(TOPICS)]
            try:
                pair = generate_questions(client, topic, i)
                f.write(json.dumps(pair, ensure_ascii=False) + "\n")
            except Exception as e:
                print(f"  [{i}] skipped — {e}")
                continue

            if (i + 1) % 50 == 0:
                elapsed = time.time() - start
                rate = (i + 1) / elapsed * 60
                print(f"  {i + 1}/{args.count} — {elapsed:.0f}s elapsed ({rate:.0f}/min)")

    elapsed = time.time() - start
    print(f"\nDone: {args.count} pairs written to {args.output} in {elapsed:.0f}s")


if __name__ == "__main__":
    main()
