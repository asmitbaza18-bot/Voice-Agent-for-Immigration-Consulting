# ADR 0003: Provider-neutral voice interfaces, no vendor yet

Date: 2026-11-27 · Status: accepted

## Context
Voice is not needed for Milestones 0 and 1. Nepali and Bengali speech quality varies a lot between vendors.

## Decision
`packages/voice` defines `SpeechToText`, `TextToSpeech` and `RealtimeVoiceAdapter` interfaces with no vendor code. Every adapter declares `VendorCompliance`, and `assertVendorCompliant` refuses vendors without no-training terms or outside the US region (guardrail 9). Realtime adapters carry audio only: the orchestrator owns dialog and guardrails.

## Next
Pick the first provider before Milestone 2, from a side-by-side Nepali/Bengali test (separate test plan document).
