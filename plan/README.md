# what this project is

I use ssh -D to create a SOCKS5 proxy on my local machine that tunnels traffic through a remote server. Sometimes it stucks and I have to restart the ssh manually. This project will help me to start ssh -D and detect ssh stuck automatically. it provides a http proxy server that forwards requests to the SOCKS5 proxy. If no data is passed through the SOCKS5 proxy for a certain period of time, the ssh process will be killed and restarted.

it will read configs from a config file

- ssh server
- port range that can be used for ssh proxy
- port that it provides for http proxy

It also show usefull information about data passed

- chart of how much is used in few minutes ago
- chart of how good ssh connection is
- total usage
- more (@ai add what you think is it good)

It use bun to run
It use ink (react) to show
it use proxy-chain npm package
