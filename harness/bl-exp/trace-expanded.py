# Experiment only: log why expanded signal sites are skipped or empty.
from pathlib import Path
q = Path("lib/negotiate-signal-sites.ts")
s = q.read_text()
old = '''    for (const layer of carrierLayers) {
      if (
        options.allowExpandedSites === false ||'''
assert s.count(old) == 1
s = s.replace(old, '''    for (const layer of carrierLayers) {
      console.log(`EXP gate ${connection.name} layer=${layer} allow=${options.allowExpandedSites} emptyOnly=${options.expandEmptyDomainsOnly} choices=${choices.length} explicit=${connection.pointsToConnect.every((point) => explicitlyAllowsCarrierLayer(native, connection, point.layer))} allOnLayer=${connection.pointsToConnect.every((point) => point.layer === layer)} nonNative=${expandNonNativeSites} haveLayer=${choices.some((choice) => choice.layer === layer)}`)
      if (
        options.allowExpandedSites === false ||''')
old2 = '''      for (const option of expanded) {
        const maxLength = maximumCarrierLength('''
assert s.count(old2) == 1
s = s.replace(old2, '''      console.log(`EXP expanded ${connection.name} layer=${layer} options=${expanded.length}`)
      for (const option of expanded) {
        const maxLength = maximumCarrierLength(''')
q.write_text(s)
print("applied trace-expanded")
