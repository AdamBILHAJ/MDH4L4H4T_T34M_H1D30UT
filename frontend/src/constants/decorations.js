const DECORATIONS = {
  general: "ls -la\nsudo apt update\nchmod +x script.sh\ncat /etc/passwd\ngrep -r 'securinets'\nwhoami\nps aux\nnetstat -tuln\nCyber security is not a product but a process.",
  crypto: "openssl genrsa\nbase64 -d\nAES-256-CBC\nRSA-4096\nsha256sum\nROT13 decryption\nElliptic Curve Cryptography\nIn cryptography we trust.",
  web_exp: "sqlmap -u target.com\nxss payload <script>\ndirb http://target\nburp suite professional\nLFI /etc/passwd\nCSRF token bypass\nIDOR vulnerability",
  forensics: "strings memory.dmp\nvolatility -f mem.raw\nexiftool image.jpg\nbinwalk -e firmware.bin\nautopsy digital investigation\nwireshark pcap analysis\nFTK Imager",
  reverse: "objdump -d binary\nchmod +x crackme\nbinary ninja\ngdb -q ./exec\nIDA Pro static analysis\nghidra decompiler\nradare2 command line\nStatic analysis vs Dynamic analysis",
  pwn: "checksec ./binary\ncyclic 100\npattern offset\nROP chain gadget\nstack canary bypass\nASLR disabled\nshellcode injected\nHeap exploitation",
  mobile: "adb shell\nfrida-ps -Uai\nobjection explore\ndex2jar classes.dex\njadx-gui decompilation\nruntime instrumentation\nipa injection",
  linux: "ls -R /\nfind / -perm -4000\nchown root:root\necho $PATH\numask 022\nsystemctl status ssh\ntop -i\nvi /etc/shadow",
  networking: "nmap -sV -sC\ntraceroute 8.8.8.8\nip addr show\nssh-keygen -t rsa\ntcpdump -i eth0\narp -a\ndnsenum example.com",
  web_dev: "npm install react\nvite build\nconst [data, setData] = useState([]);\nconsole.log(error);\nflex-direction: column;\nmedia queries\nrest api endpoint",
  threat_intel: "IOC list updated\nMISP synchronization\nMITRE ATT&CK framework\nAPT groups tracking\nTTP analysis\nthreat actor profiling\nOSINT data gathering"
};

export { DECORATIONS };
