-- VaaniTrack — where the wait goes (Phase 005)
--
-- "It is slow" was reported after a month of use, and the only stage with a
-- duration on record was extraction. Transcription was never timed, and
-- nothing recorded what the user actually sat through, which is neither stage
-- alone: it is both of them, the network either side, and the database writes
-- that used to sit in the reply path.
--
--   asr_ms    wall time of the transcription call, server side.
--   total_ms  tap-to-result as the device measured it: from the recording
--             (or typed text) leaving the hand to the transactions being on
--             screen. The only number that is the complaint itself.

alter table captures add column if not exists asr_ms   integer;
alter table captures add column if not exists total_ms integer;
