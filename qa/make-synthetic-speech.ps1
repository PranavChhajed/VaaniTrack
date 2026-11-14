Add-Type -AssemblyName System.Speech
$outDir = Join-Path $PSScriptRoot 'shots/verification/speech'
New-Item -ItemType Directory -Force $outDir | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$samples = @('250 lunch','fifteen rupees for chai','nineteen rupees for tea','two fifty lunch','250 lunch and 80 auto','250 no wait 280 for lunch','thank you for watching','I did not spend anything today')
try {
  for ($i=0; $i -lt $samples.Length; $i++) {
    $speaker.SetOutputToWaveFile((Join-Path $outDir "$i.wav"))
    $speaker.Speak($samples[$i])
    $speaker.SetOutputToNull()
  }
} finally { $speaker.Dispose() }
