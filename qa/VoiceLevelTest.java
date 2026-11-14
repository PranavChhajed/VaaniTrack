package app.vaanitrack.android;

public final class VoiceLevelTest {
    private static void check(boolean result, String message) {
        if (!result) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        VoiceLevel level = new VoiceLevel();
        for (int i = 0; i < 30; i++) check(level.sample(0) == 0, "silence");
        int quiet = 0;
        for (int i = 0; i < 30; i++) quiet = level.sample(500);
        check(quiet > 0 && quiet < 8, "quiet speech visible");
        int loud = level.sample(32767);
        check(loud > quiet, "responds to louder speech");
        for (int i = 0; i < 30; i++) loud = level.sample(32767);
        check(loud == 11, "full scale");
        int decay = level.sample(0);
        check(decay > 0 && decay < loud, "smooth release");
        for (int i = 0; i < 30; i++) decay = level.sample(0);
        check(decay == 0, "settles during pause");
        for (int amplitude : new int[]{-1, Integer.MIN_VALUE, Integer.MAX_VALUE, 0, 1, 32767}) {
            int frame = level.sample(amplitude);
            check(frame >= 0 && frame <= 11, "bounded for extreme input");
        }
        check(new VoiceLevel().sample(0) == 0, "new recording resets");
        System.out.println("PASS silence, quiet/loud speech, attack/release, pauses, bounds, reset");
    }
}
