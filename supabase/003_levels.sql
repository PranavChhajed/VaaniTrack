-- Device-measured signal level of the recording.
--
-- Added because a capture can be completely silent and still look healthy all
-- the way to the transcriber: Opus encodes at a fixed target bitrate here, so
-- silence costs the same bytes as speech. One 11.8 KB, 1.3-second recording
-- from a real handset measured -77 to -103 dBFS end to end while every column
-- already in this table said it was fine.
--
-- Only the browser can see this, because only the browser holds the PCM. It is
-- measured by the level meter that was already running for the animation, and
-- sent alongside the audio.
--
-- dBFS, so negative; 0 is full scale. Speech at arm's length peaks near -20.
alter table captures add column if not exists audio_peak_db numeric;
alter table captures add column if not exists audio_mean_db numeric;
