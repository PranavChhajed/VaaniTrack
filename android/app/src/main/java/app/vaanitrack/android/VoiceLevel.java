package app.vaanitrack.android;

/** Smoothed amplitude envelope, independent of the recorder and launcher. */
final class VoiceLevel {
    private double level;

    int sample(int amplitude) {
        double db = 20 * Math.log10(Math.max(1, Math.min(32767, amplitude)) / 32767.0);
        double target = Math.max(0, Math.min(1, (db + 48) / 42));
        level += (target - level) * (target > level ? 0.65 : 0.3);
        return Math.max(0, Math.min(11, (int) Math.round(level * 11)));
    }
}
