export class Message {
    public from: string
    public to: string
    public content: string
    public timestamp: string

    constructor(from: string, to: string, content: string, timestamp: string) {
        this.from = from
        this.to = to
        this.content = content
        this.timestamp = timestamp
    }
}
